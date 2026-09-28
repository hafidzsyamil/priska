/* Step 3: evidence for each main claim — published fact-checks and other news articles. */

import { fetchJson } from './http.mjs';
import { baseDomain } from './url.mjs';

/* Google Fact Check Tools: claims:search, Indonesian-language reviews. */
export async function searchFactChecks(query, { apiKey, timeoutMs }) {
  const url = new URL('https://factchecktools.googleapis.com/v1alpha1/claims:search');
  url.search = new URLSearchParams({ query, languageCode: 'id', pageSize: '5', key: apiKey });
  const data = await fetchJson('Google Fact Check', url, { timeoutMs });
  return (data.claims ?? [])
    .map((claim) => {
      const review = claim.claimReview?.[0];
      if (!review?.url) return null;
      return {
        klaimDiperiksa: String(claim.text ?? '').slice(0, 400),
        penerbit: review.publisher?.name || review.publisher?.site || 'Pemeriksa fakta',
        judul: review.title || String(claim.text ?? '').slice(0, 200),
        rating: review.textualRating || '(tanpa rating)',
        tanggal: (review.reviewDate || claim.claimDate || '').slice(0, 10) || null,
        url: review.url,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

/*
 * Tavily: news search first; if that finds fewer than two usable results, one general
 * web search limited to Indonesia (one extra credit). Articles from the checked
 * article's own site are excluded.
 */
export async function searchNews(query, { apiKey, articleUrl, timeoutMs }) {
  const ownDomain = baseDomain(new URL(articleUrl).hostname);
  const search = (options) => fetchJson('Tavily', 'https://api.tavily.com/search', {
    method: 'POST',
    timeoutMs,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: 5,
      exclude_domains: [ownDomain],
      include_raw_content: false,
      include_answer: false,
      ...options,
    }),
  });

  const usable = (data) => (data.results ?? [])
    .filter((result) => result.url && result.title)
    .filter((result) => {
      try {
        return baseDomain(new URL(result.url).hostname) !== ownDomain;
      } catch {
        return false;
      }
    })
    .map((result) => ({
      judul: String(result.title).trim(),
      url: result.url,
      sumber: baseDomain(new URL(result.url).hostname),
      tanggal: typeof result.published_date === 'string' ? toIsoDate(result.published_date) : null,
      cuplikan: String(result.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
    }));

  let results = usable(await search({ topic: 'news' }));
  if (results.length < 2) {
    const general = usable(await search({ topic: 'general', country: 'indonesia' }));
    const known = new Set(results.map((result) => result.url));
    results = [...results, ...general.filter((result) => !known.has(result.url))];
  }
  return results.slice(0, 3);
}

function toIsoDate(value) {
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
