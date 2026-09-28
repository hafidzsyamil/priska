/*
 * End-to-end test of the analysis function with every external API stubbed.
 * The article is fictional and hosted on a documentation IP (203.0.113.0/24).
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import handler from '../netlify/functions/analisis.mjs';

const ARTICLE_URL = 'https://203.0.113.10/kota/pemkot-resmikan-halte';

const SENTENCES = [
  'Pemerintah Kota Sukamaju meresmikan 12 halte bus listrik di koridor timur pada Sabtu, 20 September 2026.',
  'Menurut Dinas Perhubungan, pembangunan halte menelan anggaran Rp18,6 miliar dari APBD 2026.',
  'Langkah ini seharusnya sudah dilakukan sejak bertahun-tahun yang lalu oleh pemerintah kota.',
  'Armada bus listrik di koridor timur bertambah dari 8 menjadi 20 unit sejak awal September.',
  'Tarif perjalanan ditetapkan Rp4.000 untuk umum dan Rp2.000 untuk pelajar dan mahasiswa.',
];

const MARKDOWN = [
  '*   [Beranda](https://kabarsukamaju.example/)',
  '',
  `${SENTENCES[0]} ${SENTENCES[1]} Peresmian dihadiri ratusan warga dari empat kecamatan di sekitar koridor.`,
  '',
  `${SENTENCES[2]} ${SENTENCES[3]} Setiap halte dilengkapi papan jadwal digital dan jalur landai untuk kursi roda.`,
  '',
  `${SENTENCES[4]} Bus beroperasi setiap hari mulai pukul lima pagi hingga sepuluh malam dengan jeda lima belas menit.`,
  '',
  'Pewarta: Rina Hartati',
].join('\n');

let calls;
let gemini429;
let geminiDown;
let geminiModels;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  calls.push(url.hostname);

  if (url.hostname === 'r.jina.ai') {
    return jsonResponse({
      code: 200,
      data: {
        title: 'Pemkot Sukamaju Resmikan 12 Halte Bus Listrik',
        content: MARKDOWN,
        publishedTime: 'Sun, 21 Sep 2026 01:00:00 GMT',
        metadata: { 'og:site_name': 'Kabar Sukamaju', author: 'kabarsukamaju.example', 'article:published_time': '2026-09-21T08:00:00+07:00' },
      },
    });
  }

  if (url.hostname === 'generativelanguage.googleapis.com') {
    assert.equal(init.headers['x-goog-api-key'], 'kunci-gemini');
    if (gemini429) return jsonResponse({ error: { code: 429 } }, 429);
    const model = url.pathname.split('/models/')[1].split(':')[0];
    geminiModels.push(model);
    if (geminiDown.has(model)) return jsonResponse({ error: { code: 503, message: 'The model is overloaded.' } }, 503);
    const body = JSON.parse(init.body);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    const prompt = body.contents[0].parts[0].text;
    const reply = prompt.includes('Kalimat artikel, bernomor')
      ? labelReply(prompt)
      : evidenceReply(prompt);
    return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] });
  }

  if (url.hostname === 'factchecktools.googleapis.com') {
    assert.equal(url.searchParams.get('key'), 'kunci-factcheck');
    assert.equal(url.searchParams.get('languageCode'), 'id');
    if (!url.searchParams.get('query').includes('halte')) return jsonResponse({});
    return jsonResponse({
      claims: [{
        text: 'Pemkot Sukamaju meresmikan 12 halte bus listrik',
        claimReview: [{
          publisher: { name: 'Cek Fakta Contoh', site: 'cekfakta.example' },
          url: 'https://cekfakta.example/halte',
          title: 'Benar, 12 halte diresmikan',
          textualRating: 'Benar',
          reviewDate: '2026-09-22T00:00:00Z',
        }],
      }],
    });
  }

  if (url.hostname === 'api.tavily.com') {
    assert.equal(init.headers.authorization, 'Bearer kunci-tavily');
    const body = JSON.parse(init.body);
    if (body.query.includes('halte')) {
      return jsonResponse({
        results: [
          { title: 'Dua belas halte baru beroperasi', url: 'https://sukamajupos.example/halte', content: '12 halte diresmikan Sabtu.', published_date: 'Sat, 20 Sep 2026 10:00:00 GMT' },
          { title: 'Resep rendang', url: 'https://resep.example/rendang', content: 'Rendang daging sapi.' },
          { title: 'Artikel yang sama di situsnya sendiri', url: 'https://203.0.113.10/lain', content: 'x' },
        ],
      });
    }
    return jsonResponse({
      results: body.topic === 'news'
        ? [{ title: 'Armada bus listrik jadi 18 unit', url: 'https://radartimur.example/bus', content: 'Dishub menyebut 18 unit.', published_date: '2026-09-05' }]
        : [{ title: 'Bus listrik Sukamaju bertambah', url: 'https://portalwarga.example/bus', content: 'Tambahan armada tiba.' }],
    });
  }

  return new Response('tidak ada', { status: 404 });
}

function labelReply(prompt) {
  const numbered = prompt.split('Kalimat artikel, bernomor:')[1].split('Tugas:')[0];
  const lines = [...numbered.matchAll(/^(\d+)\. (.+)$/gm)].map(([, n, text]) => [Number(n), text]);
  return {
    label: lines.map(([n, text]) => ({ n, jenis: text.includes('seharusnya') ? 'opini' : 'klaim' })),
    klaim_utama: [
      { n: 1, klaim: 'Pemkot Sukamaju meresmikan 12 halte bus listrik pada 20 September 2026.', kueri: 'halte bus listrik Sukamaju' },
      { n: 5, klaim: 'Armada bus listrik koridor timur Sukamaju bertambah menjadi 20 unit.', kueri: 'armada bus listrik Sukamaju' },
      { n: 99, klaim: 'Nomor tidak ada', kueri: 'abaikan' },
    ],
    penulis: 'Rina Hartati',
    penulis_jenis: 'orang',
    sumber_disebut: ['Dinas Perhubungan', 'APBD 2026'],
  };
}

function evidenceReply(prompt) {
  const ids = [...prompt.matchAll(/^([FA]\d+-\d+) · /gm)].map(([, id]) => id);
  const stance = { 'A1-1': 'mendukung', 'A1-2': 'tidak_relevan', 'A2-1': 'membantah', 'A2-2': 'netral' };
  return {
    factcheck: ids.filter((id) => id.startsWith('F')).map((id) => ({ id, relevan: true, vonis: 'benar' })),
    pembanding: ids.filter((id) => id.startsWith('A')).map((id) => ({ id, sikap: stance[id] ?? 'netral', catatan: `Catatan ${id}.` })),
  };
}

const request = (articleUrl) => new Request(`https://priska.example/api/analisis?${new URLSearchParams({ url: articleUrl, v: '1' })}`);

const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  gemini429 = false;
  geminiDown = new Set();
  geminiModels = [];
  globalThis.fetch = fakeFetch;
  Object.assign(process.env, { GEMINI_API_KEY: 'kunci-gemini', FACTCHECK_API_KEY: 'kunci-factcheck', TAVILY_API_KEY: 'kunci-tavily' });
  delete process.env.JINA_API_KEY;
  delete process.env.GEMINI_MODEL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('a full analysis returns the demo JSON shape with cache headers', async () => {
  const response = await handler(request(`${ARTICLE_URL}?utm_source=wa#atas`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('netlify-cdn-cache-control'), /durable/);
  assert.equal(response.headers.get('netlify-vary'), 'query=url|v');

  const body = await response.json();
  assert.equal(body.demo, false);
  assert.equal(body.artikel.url, ARTICLE_URL);
  assert.equal(body.artikel.sumber, 'Kabar Sukamaju');
  assert.equal(body.artikel.penulis, 'Rina Hartati');
  assert.equal(body.artikel.tanggal, '2026-09-21');

  assert.equal(body.kalimat.length, 8);
  assert.equal(body.kalimat.filter((item) => item.jenis === 'opini').length, 1);

  assert.equal(body.klaim_utama.length, 2, 'the out-of-range claim is dropped');
  assert.equal(body.klaim_utama[0].factcheck.rating, 'Benar');
  assert.equal(body.klaim_utama[0].factcheck.tanggal, '2026-09-22');
  assert.equal(body.klaim_utama[1].factcheck, null);

  assert.deepEqual(body.pembanding.map((item) => [item.klaim, item.sikap, item.sumber]), [
    [1, 'mendukung', 'sukamajupos.example'],
    [2, 'membantah', 'radartimur.example'],
    [2, 'netral', 'portalwarga.example'],
  ]);
  assert.ok(!body.pembanding.some((item) => item.url.includes('203.0.113.10')), 'own site excluded');
  assert.equal(body.pembanding[0].tanggal, '2026-09-20');

  assert.deepEqual(body.komponen.map((part) => part.nama), ['Dukungan sumber lain', 'Fact-check yang ada', 'Porsi klaim faktual', 'Transparansi sumber']);
  // Support: claim 1 = 1, claim 2 = (0 + 0.5) / 2 -> 35 * 0.625 = 21.9. Fact-check: (1 + 0.6) / 2 -> 20.
  // Share: 7 of 8 -> 13. Transparency: author 7 + date 6 + two sources 8 = 21.
  assert.deepEqual(body.komponen.map((part) => part.nilai), [22, 20, 13, 21]);
  assert.deepEqual(body.catatan, []);
  assert.equal(calls.filter((host) => host === 'api.tavily.com').length, 3, 'one general fallback search for claim 2');
});

test('a result with a failed search is returned with a note but not cached', async () => {
  globalThis.fetch = async (input, init) => {
    if (new URL(String(input)).hostname === 'api.tavily.com') return jsonResponse({ detail: 'down' }, 500);
    return fakeFetch(input, init);
  };
  const response = await handler(request(ARTICLE_URL));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('netlify-cdn-cache-control'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body.pembanding, []);
  assert.match(body.catatan.join(' '), /artikel pembanding sebagian gagal/);
  assert.match(body.komponen[0].alasan, /Pencarian artikel pembanding sedang gagal/);
});

test('a missing key means the engine is not configured yet', async () => {
  delete process.env.TAVILY_API_KEY;
  const response = await handler(request(ARTICLE_URL));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).galat, 'belum_dikonfigurasi');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(calls, []);
});

test('an invalid link is rejected before any API call', async () => {
  const response = await handler(request('http://localhost/admin'));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).galat, 'link_tidak_valid');
  assert.deepEqual(calls, []);
});

test('an overloaded Gemini model falls back to the next one', async () => {
  geminiDown = new Set(['gemini-3.1-flash-lite']);
  const response = await handler(request(ARTICLE_URL));
  assert.equal(response.status, 200);
  assert.deepEqual(geminiModels, ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']);
});

test('GEMINI_MODEL is tried first, with the defaults as fallback', async () => {
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  geminiDown = new Set(['gemini-3.8-flash']);
  const response = await handler(request(ARTICLE_URL));
  assert.equal(response.status, 200);
  assert.deepEqual(geminiModels.slice(0, 2), ['gemini-3.8-flash', 'gemini-3.1-flash-lite']);
});

test('models that stay overloaded are retried in rounds, then reported as busy', async () => {
  geminiDown = new Set(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']);
  const response = await handler(request(ARTICLE_URL));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).galat, 'ai_sibuk');
  assert.equal(geminiModels.length, 8, 'eight attempts across both models');
});

test('an overload that clears is absorbed by the retry', async () => {
  geminiDown = new Set(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']);
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (new URL(String(input)).hostname === 'generativelanguage.googleapis.com' && ++calls === 3) geminiDown.clear();
    return original(input, init);
  };
  const response = await handler(request(ARTICLE_URL));
  assert.equal(response.status, 200);
});

test('an exhausted Gemini quota is reported as such', async () => {
  gemini429 = true;
  const response = await handler(request(ARTICLE_URL));
  assert.equal(response.status, 429);
  assert.equal((await response.json()).galat, 'kuota_habis');
});

test('a page without readable text is reported, not scored', async () => {
  globalThis.fetch = async (input, init) => {
    if (new URL(String(input)).hostname === 'r.jina.ai') return jsonResponse({ code: 200, data: { title: 'Galeri', content: '*   [Menu](/)' } });
    return fakeFetch(input, init);
  };
  const response = await handler(request(ARTICLE_URL));
  assert.equal(response.status, 422);
  assert.equal((await response.json()).galat, 'artikel_tidak_terbaca');
});
