/*
 * Step 1: read the article behind a link.
 *
 * Jina Reader returns the whole page as Markdown (menus, footers and all), so the
 * article body is taken as the densest run of prose paragraphs. If Jina fails or
 * finds too little text, the page is fetched directly and parsed from its HTML
 * (JSON-LD, meta tags, <p> elements). No parsing libraries: regular expressions only.
 */

import { ApiError, UpstreamError, fetchJson } from './http.mjs';
import { assertPublicUrl, baseDomain, normalizeArticleUrl } from './url.mjs';

const MIN_WORDS = 80;
const MIN_PROSE_WORDS = 12;
const MAX_LINE_GAP = 6;
const USER_AGENT = 'Mozilla/5.0 (compatible; CekKredibilitas/1.0; +https://priska-website.netlify.app)';
const BOILERPLATE = /^(baca juga|simak juga|lihat juga|tonton juga|baca selengkapnya|advertisement|scroll to continue|dilarang keras|copyright|hak cipta)/i;
const BYLINE = /^(?:pewarta|penulis|reporter|wartawan|oleh|ditulis oleh)\s*:\s*(.{3,80})$/i;
const ARTICLE_TYPES = /^(NewsArticle|Article|ReportageNewsArticle|AnalysisNewsArticle|OpinionNewsArticle|BlogPosting)$/;

export async function extractArticle(url, { jinaKey, deadline }) {
  let best = null;

  const jinaTimeout = deadline.timeout(25_000);
  try {
    best = await viaJina(url, jinaKey, jinaTimeout);
  } catch (error) {
    console.warn('Jina Reader gagal:', error.message);
  }

  if (!best || wordCount(best.paragraf) < MIN_WORDS) {
    const htmlTimeout = deadline.timeout(15_000);
    try {
      const fromHtml = await viaHtml(url, htmlTimeout);
      best = mergeSources(best, fromHtml);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.warn('Ambil HTML langsung gagal:', error.message);
    }
  }

  if (!best || wordCount(best.paragraf) < MIN_WORDS) {
    throw new ApiError(422, 'artikel_tidak_terbaca',
      'Isi artikel tidak bisa dibaca dari link ini. Situsnya mungkin menolak akses otomatis, atau halamannya bukan artikel berita.');
  }

  const { hostname } = new URL(url);
  return {
    url,
    domain: hostname.replace(/^www\./, ''),
    sumber: best.sumber || baseDomain(hostname),
    judul: best.judul || '(Tanpa judul)',
    penulisMeta: best.penulisMeta,
    byline: best.byline,
    tanggal: best.tanggal,
    paragraf: best.paragraf,
  };
}

/* ---------- Jina Reader ---------- */

async function viaJina(url, apiKey, timeoutMs) {
  const headers = { accept: 'application/json', 'x-retain-images': 'none' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const body = await fetchJson('Jina Reader', `https://r.jina.ai/${url}`, { headers, timeoutMs });
  const data = body.data ?? {};
  const meta = data.metadata ?? {};
  const content = data.content ?? '';
  return {
    judul: cleanText(data.title || meta['og:title'] || ''),
    sumber: cleanText(meta['og:site_name'] || ''),
    // Site-specific author tags first: the generic "author" is often the company name.
    penulisMeta: personName(meta.content_author || meta['dtk:author'] || meta.author || meta['article:author']),
    byline: bylineFromLines(content.split('\n').map(stripMarkdown)),
    tanggal: isoDate(meta['article:published_time']) || isoDate(meta.publishdate) || isoDate(meta.pubdate)
      || isoDate(meta['dtk:publishdate']) || isoDate(data.publishedTime),
    paragraf: articleBodyFromMarkdown(content),
  };
}

/* The longest run of prose lines, allowing short gaps (captions, ads, "Baca juga"). */
export function articleBodyFromMarkdown(markdown) {
  const lines = markdown.split('\n').map((line) => {
    const text = stripMarkdown(line);
    return isProse(text, line) ? text : null;
  });
  return densestRun(lines, MAX_LINE_GAP);
}

function isProse(text, original = text) {
  // List items, tables, quotes, headings. Bold text at the start of a line ("**Jakarta** - ...") is prose.
  if (!text || /^\s*([*+-]\s|[|>#]|\d+\.\s)/.test(original)) return false;
  if (BOILERPLATE.test(text)) return false;
  return text.split(/\s+/).length >= MIN_PROSE_WORDS;
}

function stripMarkdown(line) {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Groups non-null items separated by at most `maxGap` nulls; returns the group with most words. */
function densestRun(items, maxGap) {
  let best = [];
  let current = [];
  let gap = 0;
  for (const item of items) {
    if (item) {
      current.push(item);
      gap = 0;
    } else if (current.length && ++gap > maxGap) {
      if (wordCount(current) > wordCount(best)) best = current;
      current = [];
      gap = 0;
    }
  }
  return wordCount(current) > wordCount(best) ? current : best;
}

/* ---------- Direct HTML ---------- */

async function viaHtml(url, timeoutMs) {
  const html = await fetchHtml(url, timeoutMs);
  const meta = metaTags(html);
  const article = jsonLdArticle(html);
  const bodyFromLd = article?.articleBody ? [decodeEntities(String(article.articleBody))] : [];
  const paragraphs = paragraphsFromHtml(html);
  return {
    judul: cleanText(article?.headline || meta['og:title'] || titleTag(html)),
    sumber: cleanText(meta['og:site_name'] || article?.publisher?.name || ''),
    penulisMeta: personName(authorName(article?.author) || meta.author || meta['dtk:author']),
    byline: bylineFromLines(paragraphsAll(html)),
    tanggal: isoDate(article?.datePublished) || isoDate(meta['article:published_time']) || isoDate(meta.publishdate),
    paragraf: wordCount(bodyFromLd) > wordCount(paragraphs) ? bodyFromLd : paragraphs,
  };
}

async function fetchHtml(url, timeoutMs) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    current = normalizeArticleUrl(current);
    await assertPublicUrl(current);
    let response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new UpstreamError('situs artikel', 0, error.message);
    }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) throw new UpstreamError('situs artikel', response.status);
    if (!(response.headers.get('content-type') ?? '').includes('html')) {
      throw new UpstreamError('situs artikel', response.status, 'bukan halaman HTML');
    }
    return (await response.text()).slice(0, 3_000_000);
  }
  throw new UpstreamError('situs artikel', 0, 'terlalu banyak pengalihan');
}

function metaTags(html) {
  const tags = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = {};
    for (const [, name, , doubleQuoted, singleQuoted] of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      attributes[name.toLowerCase()] = decodeEntities(doubleQuoted ?? singleQuoted ?? '');
    }
    const key = (attributes.property || attributes.name || '').toLowerCase();
    if (key && attributes.content && !(key in tags)) tags[key] = attributes.content;
  }
  return tags;
}

function jsonLdArticle(html) {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, json] of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(json.trim());
    } catch {
      continue;
    }
    const nodes = [parsed].flat().flatMap((node) => [node, ...(node?.['@graph'] ?? [])]);
    const article = nodes.find((node) => [node?.['@type']].flat().some((type) => ARTICLE_TYPES.test(type ?? '')));
    if (article) return article;
  }
  return null;
}

function authorName(author) {
  const first = [author].flat()[0];
  return typeof first === 'string' ? first : first?.name ?? null;
}

function paragraphsAll(html) {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(([, inner]) => htmlToText(inner));
}

export function paragraphsFromHtml(html) {
  return densestRun(paragraphsAll(html).map((text) => (isProse(text) ? text : null)), 3);
}

function titleTag(html) {
  return htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
}

function htmlToText(fragment) {
  return decodeEntities(fragment.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/* ---------- Shared helpers ---------- */

/* Combines two extraction attempts: keep the longer body, fill missing metadata. */
function mergeSources(a, b) {
  if (!a) return b;
  const body = wordCount(b.paragraf) > wordCount(a.paragraf) ? b.paragraf : a.paragraf;
  return {
    judul: a.judul || b.judul,
    sumber: a.sumber || b.sumber,
    penulisMeta: a.penulisMeta || b.penulisMeta,
    byline: a.byline || b.byline,
    tanggal: a.tanggal || b.tanggal,
    paragraf: body,
  };
}

function bylineFromLines(lines) {
  for (const line of lines) {
    const match = line.trim().match(BYLINE);
    if (match) return match[1].trim();
  }
  return null;
}

/* Drops values that are clearly not a person: URLs, domains, handles. */
function personName(value) {
  const text = cleanText(typeof value === 'string' ? value : '');
  if (!text || /^https?:\/\//i.test(text) || /^@/.test(text) || /^[\w-]+(\.[\w-]+)+$/.test(text)) return null;
  return text.slice(0, 120);
}

const jakartaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });

/*
 * ISO-like dates only ("2026-09-28T06:46:25+07:00", "2026/09/27 15:21"). HTTP dates are ignored.
 * Timestamps with a zone are read as a date in Jakarta, so 01:00 UTC stays the same WIB day.
 */
export function isoDate(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (!match) return null;
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const instant = new Date(text);
    if (!Number.isNaN(instant.getTime())) return jakartaDate.format(instant);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function wordCount(paragraphs) {
  return (paragraphs ?? []).reduce((sum, text) => sum + text.split(/\s+/).filter(Boolean).length, 0);
}

/* ---------- Sentences ---------- */

const segmenter = new Intl.Segmenter('id', { granularity: 'sentence' });

export function splitSentences(paragraphs, limit) {
  const sentences = [];
  for (const paragraph of paragraphs) {
    for (const { segment } of segmenter.segment(paragraph)) {
      const sentence = segment.replace(/\s+/g, ' ').trim();
      if (sentence.split(' ').length >= 4) sentences.push(sentence);
    }
  }
  return { kalimat: sentences.slice(0, limit), terpotong: sentences.length > limit };
}
