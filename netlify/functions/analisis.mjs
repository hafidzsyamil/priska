/*
 * GET /api/analisis?url=<article link>&v=<result version>
 *
 * Runs the whole check for one article and returns the same JSON shape as the demo
 * results in public/data/contoh/, so public/js/hasil.js renders both.
 *
 *   1. extract    Jina Reader (fallback: the page's own HTML)
 *   2. label      Gemini: claim/opinion per sentence, three main claims, author, sources
 *   3. evidence   Google Fact Check + Tavily news search, per main claim, in parallel
 *   4. judge      Gemini: which fact-checks match, stance of each comparison article
 *   5. score      computed in code (netlify/lib/skor.mjs)
 *
 * Successful results are cached on Netlify's CDN per `url` and `v` for a week, and
 * survive deploys (Netlify-Cache-ID). Bump `v` in public/js/hasil.js when the result
 * format or scoring changes, so old cached results are not reused.
 */

import { extractArticle, splitSentences } from '../lib/ekstrak.mjs';
import { judgeEvidence, labelArticle } from '../lib/gemini.mjs';
import { ApiError, createDeadline } from '../lib/http.mjs';
import { computeScore } from '../lib/skor.mjs';
import { searchFactChecks, searchNews } from '../lib/sumber.mjs';
import { assertPublicUrl, normalizeArticleUrl } from '../lib/url.mjs';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const MAX_SENTENCES = 120;
const MAX_COMPARISONS_PER_CLAIM = 2;
const MAX_COMPARISONS = 5;
const RESULT_VERSION = 1;

export const config = {
  path: '/api/analisis',
  method: 'GET',
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

export default async (request) => {
  const started = Date.now();
  try {
    const keys = readKeys();
    const url = normalizeArticleUrl(new URL(request.url).searchParams.get('url'));
    await assertPublicUrl(url);
    const { result, complete } = await analyse(url, keys, createDeadline(55_000));
    result.durasi_detik = Math.round((Date.now() - started) / 100) / 10;
    // A result missing evidence because a search service failed is not cached, so the next visit retries.
    return json(200, result, complete ? {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=604800',
      'Netlify-Vary': 'query=url|v',
      'Netlify-Cache-ID': 'analisis',
    } : {});
  } catch (error) {
    if (error instanceof ApiError) return json(error.status, { galat: error.galat, pesan: error.pesan });
    console.error('Analisis gagal:', error);
    return json(502, {
      galat: 'layanan_gagal',
      pesan: 'Salah satu layanan analisis sedang bermasalah. Coba lagi beberapa saat lagi.',
    });
  }
};

function readKeys() {
  const env = (name) => (globalThis.Netlify?.env?.get(name) ?? process.env[name] ?? '').trim();
  const keys = {
    gemini: env('GEMINI_API_KEY'),
    factcheck: env('FACTCHECK_API_KEY'),
    tavily: env('TAVILY_API_KEY'),
    jina: env('JINA_API_KEY'),
    model: env('GEMINI_MODEL') || DEFAULT_MODEL,
  };
  if (!keys.gemini || !keys.factcheck || !keys.tavily) {
    throw new ApiError(503, 'belum_dikonfigurasi', 'Mesin analisis belum aktif.');
  }
  return keys;
}

async function analyse(url, keys, deadline) {
  const notes = [];

  // 1. Extract
  const article = await extractArticle(url, { jinaKey: keys.jina, deadline });
  const { kalimat: sentences, terpotong } = splitSentences(article.paragraf, MAX_SENTENCES);
  if (sentences.length < 3) {
    throw new ApiError(422, 'artikel_tidak_terbaca', 'Artikel ini terlalu pendek untuk dianalisis.');
  }
  if (terpotong) notes.push(`Artikel ini panjang. Hanya ${MAX_SENTENCES} kalimat pertama yang dianalisis.`);

  // 2. Label
  const labels = await labelArticle(article, sentences, {
    apiKey: keys.gemini, model: keys.model, timeoutMs: deadline.timeout(25_000),
  });
  const claims = labels.klaimUtama;

  // 3. Evidence
  const failed = { factcheck: false, pembanding: false };
  const searchTimeout = deadline.timeout(12_000);
  const evidence = await Promise.all(claims.map(async (claim) => {
    const [factChecks, articles] = await Promise.all([
      searchFactChecks(claim.kueri, { apiKey: keys.factcheck, timeoutMs: searchTimeout }).catch((error) => {
        console.warn('Fact check gagal:', error.message);
        failed.factcheck = true;
        return [];
      }),
      searchNews(claim.kueri, { apiKey: keys.tavily, articleUrl: url, timeoutMs: searchTimeout }).catch((error) => {
        console.warn('Tavily gagal:', error.message);
        failed.pembanding = true;
        return [];
      }),
    ]);
    return { factChecks, articles };
  }));
  if (failed.factcheck) notes.push('Pencarian fact-check sedang gagal. Komponen fact-check memakai nilai netral.');
  if (failed.pembanding) notes.push('Pencarian artikel pembanding sebagian gagal. Hasil pembanding mungkin tidak lengkap.');

  // 4. Judge
  const factCandidates = evidence.flatMap(({ factChecks }, index) =>
    factChecks.map((item, position) => ({ ...item, id: `F${index + 1}-${position + 1}`, klaim: index + 1 })));
  const articleCandidates = evidence.flatMap(({ articles }, index) =>
    articles.map((item, position) => ({ ...item, id: `A${index + 1}-${position + 1}`, klaim: index + 1 })));
  const judged = factCandidates.length || articleCandidates.length
    ? await judgeEvidence(claims, factCandidates, articleCandidates, {
      apiKey: keys.gemini, model: keys.model, timeoutMs: deadline.timeout(20_000),
    })
    : { factcheck: new Map(), pembanding: new Map() };

  const perClaim = claims.map((_, index) => {
    const number = index + 1;
    const factcheck = factCandidates
      .filter((item) => item.klaim === number)
      .map((item) => ({ ...item, verdict: judged.factcheck.get(item.id) }))
      .find((item) => item.verdict?.relevan);
    const comparisons = articleCandidates
      .filter((item) => item.klaim === number)
      .map((item) => ({ ...item, verdict: judged.pembanding.get(item.id) }))
      .filter((item) => item.verdict && item.verdict.sikap !== 'tidak_relevan')
      .slice(0, MAX_COMPARISONS_PER_CLAIM)
      .map((item) => ({
        klaim: number,
        sikap: item.verdict.sikap,
        judul: item.judul,
        sumber: item.sumber,
        url: item.url,
        tanggal: item.tanggal,
        catatan: String(item.verdict.catatan ?? '').trim(),
      }));
    return {
      factcheck: factcheck ? {
        penerbit: factcheck.penerbit,
        judul: factcheck.judul,
        rating: factcheck.rating,
        tanggal: factcheck.tanggal,
        url: factcheck.url,
        vonis: factcheck.verdict.vonis,
      } : null,
      pembanding: comparisons,
    };
  });

  // Keep at most five comparisons overall, taking them round-robin across claims.
  let kept = 0;
  const keptPerClaim = perClaim.map(() => []);
  for (let round = 0; round < MAX_COMPARISONS_PER_CLAIM; round += 1) {
    perClaim.forEach((claim, index) => {
      if (kept < MAX_COMPARISONS && claim.pembanding[round]) {
        keptPerClaim[index].push(claim.pembanding[round]);
        kept += 1;
      }
    });
  }
  perClaim.forEach((claim, index) => { claim.pembanding = keptPerClaim[index]; });

  // 5. Score
  const score = computeScore({
    claims: perClaim,
    sentenceKinds: labels.jenis,
    penulis: labels.penulis,
    penulisJenis: labels.penulisJenis,
    adaTanggal: Boolean(article.tanggal),
    sumberDisebut: labels.sumberDisebut,
    failed,
  });

  const result = {
    demo: false,
    versi: RESULT_VERSION,
    dianalisis: new Date().toISOString(),
    artikel: {
      url: article.url,
      domain: article.domain,
      sumber: article.sumber,
      judul: article.judul,
      penulis: {
        orang: labels.penulis,
        redaksi: article.byline || article.penulisMeta || 'Redaksi',
      }[labels.penulisJenis] ?? null,
      tanggal: article.tanggal,
    },
    ringkasan: score.ringkasan,
    komponen: score.komponen,
    klaim_utama: claims.map((claim, index) => {
      const factcheck = perClaim[index].factcheck;
      return {
        teks: claim.klaim,
        factcheck: factcheck && {
          penerbit: factcheck.penerbit,
          judul: factcheck.judul,
          rating: factcheck.rating,
          tanggal: factcheck.tanggal,
          url: factcheck.url,
        },
      };
    }),
    pembanding: perClaim.flatMap((claim) => claim.pembanding),
    kalimat: sentences.map((teks, index) => ({ jenis: labels.jenis[index], teks })),
    catatan: notes,
  };
  return { result, complete: !failed.factcheck && !failed.pembanding };
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}
