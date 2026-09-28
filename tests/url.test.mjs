import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../netlify/lib/http.mjs';
import { assertPublicUrl, baseDomain, isPrivateAddress, normalizeArticleUrl } from '../netlify/lib/url.mjs';

test('normalizeArticleUrl strips fragments and tracking parameters', () => {
  assert.equal(
    normalizeArticleUrl('  https://www.contoh.id/berita/1?utm_source=wa&id=7&fbclid=x#komentar '),
    'https://www.contoh.id/berita/1?id=7',
  );
});

test('normalizeArticleUrl rejects non-web and odd links', () => {
  for (const raw of ['javascript:alert(1)', 'ftp://contoh.id/a', 'https://user:pw@contoh.id/', 'https://contoh.id:8080/a', 'bukan link', '', null]) {
    assert.throws(() => normalizeArticleUrl(raw), (error) => error instanceof ApiError && error.status === 400, String(raw));
  }
});

test('isPrivateAddress covers local, private, and mapped ranges', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ['203.0.113.10', '8.8.8.8', '2606:4700::1111']) {
    assert.equal(isPrivateAddress(address), false, address);
  }
});

test('assertPublicUrl rejects local hosts without a DNS lookup', async () => {
  for (const href of ['http://localhost/a', 'http://127.0.0.1/a', 'http://[::1]/a', 'http://intranet/a', 'http://printer.local/a']) {
    await assert.rejects(assertPublicUrl(href), (error) => error instanceof ApiError && error.status === 400, href);
  }
  await assertPublicUrl('https://203.0.113.10/berita');
});

test('baseDomain keeps the registrable domain', () => {
  assert.equal(baseDomain('news.detik.com'), 'detik.com');
  assert.equal(baseDomain('www.kompas.co.id'), 'kompas.co.id');
  assert.equal(baseDomain('cekfakta.tempo.co'), 'tempo.co');
  assert.equal(baseDomain('kabarsukamaju.example'), 'kabarsukamaju.example');
});
