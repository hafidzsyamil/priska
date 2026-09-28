/* Validating and normalising the article link a visitor submits. */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ApiError } from './http.mjs';

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid)$/i;

/* Second-level domains under which the registrable domain has three labels. */
const TWO_LEVEL_SUFFIXES = new Set([
  'co.id', 'or.id', 'ac.id', 'go.id', 'web.id', 'my.id', 'sch.id', 'net.id', 'biz.id', 'mil.id', 'ponpes.id', 'desa.id',
  'co.uk', 'org.uk', 'ac.uk', 'com.au', 'com.sg', 'com.my',
]);

/* http(s) only, no credentials, tracking parameters and fragment removed. Throws 400 otherwise. */
export function normalizeArticleUrl(raw) {
  const invalid = new ApiError(400, 'link_tidak_valid', 'Link tidak valid. Tempel alamat lengkap artikel, diawali https://.');
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) throw invalid;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalid;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalid;
  if (url.port && !['80', '443'].includes(url.port)) throw invalid;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

/* Rejects links that point at private or local addresses, including via DNS. */
export async function assertPublicUrl(href) {
  const { hostname } = new URL(href);
  const host = hostname.replace(/^\[|\]$/g, '');
  const blocked = new ApiError(400, 'link_tidak_valid', 'Link ini tidak bisa diperiksa.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') && !isIP(host)) {
    throw blocked;
  }
  let addresses;
  try {
    addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  } catch {
    throw new ApiError(422, 'artikel_tidak_terbaca', 'Situs di link ini tidak ditemukan. Periksa kembali alamatnya.');
  }
  if (addresses.some(({ address }) => isPrivateAddress(address))) throw blocked;
}

export function isPrivateAddress(address) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19));
  }
  const lower = address.toLowerCase();
  return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
}

/* "news.detik.com" -> "detik.com", "www.kompas.co.id" -> "kompas.co.id". */
export function baseDomain(hostname) {
  const labels = hostname.toLowerCase().replace(/^www\./, '').split('.');
  const lastTwo = labels.slice(-2).join('.');
  return labels.slice(TWO_LEVEL_SUFFIXES.has(lastTwo) ? -3 : -2).join('.');
}
