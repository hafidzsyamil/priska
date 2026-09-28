import assert from 'node:assert/strict';
import { test } from 'node:test';
import { articleBodyFromMarkdown, isoDate, paragraphsFromHtml, splitSentences, wordCount } from '../netlify/lib/ekstrak.mjs';

const PARAGRAPHS = [
  'Pemerintah Kota Sukamaju meresmikan 12 halte bus listrik di koridor timur pada Sabtu pagi bersama warga sekitar.',
  'Menurut Dinas Perhubungan, pembangunan halte menelan anggaran Rp18,6 miliar dari APBD 2026 yang disetujui dewan.',
  '"Kami ingin warga beralih ke transportasi umum yang nyaman dan murah," kata Wali Kota Sukamaju di lokasi peresmian.',
  'Armada bus listrik di koridor timur bertambah dari delapan menjadi dua puluh unit sejak awal bulan September ini.',
];

/* Shaped like Jina Reader output: navigation, the article with an ad and a "Baca juga" link, then a footer. */
const MARKDOWN = [
  '*   [Beranda](https://kabarsukamaju.example/)',
  '*   [Kota](https://kabarsukamaju.example/kota)',
  '[![Logo](https://kabarsukamaju.example/logo.png)](https://kabarsukamaju.example/)',
  '# Pemkot Sukamaju Resmikan 12 Halte Bus Listrik',
  '',
  `**Sukamaju** - ${PARAGRAPHS[0]}`,
  '',
  PARAGRAPHS[1],
  '',
  'ADVERTISEMENT',
  '',
  'Baca juga: [Warga keluhkan halte baru belum dilengkapi peneduh di kawasan timur kota Sukamaju hari ini](https://x.example/a)',
  '',
  PARAGRAPHS[2],
  '',
  PARAGRAPHS[3],
  '',
  '*   [Tentang kami](https://kabarsukamaju.example/tentang)',
  '*   [Kontak](https://kabarsukamaju.example/kontak)',
  '*   [Pedoman media siber](https://kabarsukamaju.example/pedoman)',
  '*   [Karier](https://kabarsukamaju.example/karier)',
  '*   [Iklan](https://kabarsukamaju.example/iklan)',
  '*   [Privasi](https://kabarsukamaju.example/privasi)',
  '*   [Syarat](https://kabarsukamaju.example/syarat)',
  'Hak cipta 2026 Kabar Sukamaju. Dilarang mengambil sebagian atau seluruh isi situs ini tanpa izin tertulis dari redaksi kami.',
].join('\n');

test('articleBodyFromMarkdown keeps the article and drops navigation, ads, and footer', () => {
  const body = articleBodyFromMarkdown(MARKDOWN);
  assert.deepEqual(body, [`Sukamaju - ${PARAGRAPHS[0]}`, ...PARAGRAPHS.slice(1)]);
});

test('paragraphsFromHtml reads <p> text and decodes entities', () => {
  const html = `<html><body><nav><p>Menu</p></nav><article>${PARAGRAPHS.map((text) => `<p>${text.replace(/"/g, '&quot;')}</p>`).join('')}`
    + '<p class="caption">Foto: dokumen</p></article><footer><p>&copy; Kabar</p></footer></body></html>';
  assert.deepEqual(paragraphsFromHtml(html), PARAGRAPHS);
});

test('splitSentences splits paragraphs, drops fragments, and reports truncation', () => {
  const { kalimat, terpotong } = splitSentences(['Satu dua tiga empat. Ya. Lima enam tujuh delapan sembilan.'], 5);
  assert.deepEqual(kalimat, ['Satu dua tiga empat.', 'Lima enam tujuh delapan sembilan.']);
  assert.equal(terpotong, false);
  assert.equal(splitSentences(PARAGRAPHS, 2).terpotong, true);
});

test('isoDate accepts ISO-like dates only', () => {
  assert.equal(isoDate('2026-09-28T06:46:25+07:00'), '2026-09-28');
  assert.equal(isoDate('2026-09-27T20:30:00Z'), '2026-09-28', 'UTC evening is the next morning in Jakarta');
  assert.equal(isoDate('2026/09/27 15:21:01'), '2026-09-27');
  assert.equal(isoDate('Sat, 26 Sep 2026 09:10:30 GMT'), null);
  assert.equal(isoDate(undefined), null);
});

test('wordCount counts words across paragraphs', () => {
  assert.equal(wordCount(['satu dua', ' tiga ']), 3);
});
