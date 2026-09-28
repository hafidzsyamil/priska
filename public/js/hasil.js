/*
 * Results page.
 *
 * Reads ?contoh=<id> (a demo result) or ?url=<link> (from the check form),
 * loads the matching result JSON and renders it. Until the analysis backend
 * exists, only the demo results in /data/contoh/ can be shown; any other link
 * gets an honest "not available yet" state.
 *
 * All text from the data is inserted with textContent, never as HTML, because
 * real results will contain text scraped from third-party articles.
 */

'use strict';

const DATA_DIR = '/data/contoh/';

const BANDS = [
  { min: 70, label: 'Tinggi' },
  { min: 40, label: 'Sedang' },
  { min: 0, label: 'Rendah' },
];

const STANCES = {
  mendukung: 'Mendukung',
  membantah: 'Membantah',
  netral: 'Netral',
};

const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const numberFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

const root = document.getElementById('hasil');
const statusLine = document.getElementById('status');

main();

async function main() {
  const params = new URLSearchParams(window.location.search);
  const exampleId = params.get('contoh');
  const submittedUrl = params.get('url');

  try {
    const examples = await fetchJson(`${DATA_DIR}index.json`);
    const match = exampleId
      ? examples.find((item) => item.id === exampleId)
      : examples.find((item) => sameArticle(item.url, submittedUrl));

    if (match) {
      renderResult(await fetchJson(`${DATA_DIR}${match.id}.json`));
    } else {
      renderUnavailable(submittedUrl, examples);
    }
  } catch (error) {
    console.error(error);
    renderError();
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

/* Two links point at the same article if host (minus www.) and path match. */
function sameArticle(a, b) {
  const key = (value) => {
    try {
      const url = new URL(value);
      return url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/+$/, '');
    } catch {
      return null;
    }
  };
  const keyA = key(a);
  return keyA !== null && keyA === key(b);
}

/* ---------- Result ---------- */

function renderResult(data) {
  const total = data.komponen.reduce((sum, part) => sum + part.nilai, 0);
  const band = BANDS.find((b) => total >= b.min);

  document.title = `${total}/100 · ${data.artikel.judul} — Cek Kredibilitas`;
  show(
    data.demo ? demoStrip() : null,
    articleSection(data),
    rule(),
    scoreSection(data, total, band),
    rule(),
    claimsSection(data),
    rule(),
    comparisonsSection(data),
    rule(),
    sentencesSection(data),
    closingSection(),
  );
  statusLine.textContent = `Hasil dimuat. Skor ${total} dari 100, indikator ${band.label.toLowerCase()}.`;
}

function demoStrip() {
  return el('div', { class: 'inverted demo-strip' },
    el('p', { class: 'container label' }, 'Data contoh — artikel, media, dan hasil di halaman ini fiktif.'));
}

function articleSection(data) {
  const { artikel } = data;
  return el('section', { class: 'article-head', 'aria-labelledby': 'judul-artikel' },
    el('div', { class: 'container' },
      el('p', { class: 'label' }, `Artikel diperiksa · ${artikel.sumber}`),
      el('h1', { id: 'judul-artikel', class: 'article-head__title' }, artikel.judul),
      el('ul', { class: 'meta-list label' },
        metaItem(artikel.penulis, 'Penulis tidak dicantumkan'),
        metaItem(formatDate(artikel.tanggal), 'Tanggal tidak dicantumkan'),
        el('li', {}, `Dianalisis dalam ${numberFormat.format(data.durasi_detik)} detik`)),
      el('p', { class: 'article-head__url' }, sourceLink(artikel.url, artikel.url, data.demo))));
}

function metaItem(value, missingText) {
  return value ? el('li', {}, value) : el('li', { class: 'is-missing' }, missingText);
}

function scoreSection(data, total, band) {
  const scale = el('div', { class: 'scale', 'aria-hidden': 'true' },
    el('div', { class: 'scale__track' },
      el('span', { class: 'scale__fill' }),
      el('span', { class: 'scale__tick scale__tick--40' }),
      el('span', { class: 'scale__tick scale__tick--70' })),
    el('ol', { class: 'scale__labels label' },
      el('li', { class: 'at-0' }, '0'),
      el('li', { class: 'at-40' }, '40'),
      el('li', { class: 'at-70' }, '70'),
      el('li', { class: 'at-100' }, '100')));
  scale.style.setProperty('--pos', total / 100);

  return el('section', { id: 'skor', class: 'section texture-grid', 'aria-labelledby': 'skor-judul' },
    el('div', { class: 'container' },
      el('div', { class: 'score__top' },
        el('p', { class: 'score__number' },
          el('span', { class: 'visually-hidden' }, 'Skor '),
          String(total),
          el('span', { class: 'score__max', 'aria-hidden': 'true' }, '/100'),
          el('span', { class: 'visually-hidden' }, ' dari 100')),
        el('div', { class: 'score__summary' },
          el('p', { class: 'label' }, 'Skor kredibilitas'),
          el('h2', { id: 'skor-judul', class: 'score__band' }, 'Indikator: ', el('em', {}, band.label)),
          el('p', { class: 'lead' }, data.ringkasan),
          scale,
          el('p', { class: 'score__note' },
            'Skor ini indikator, bukan vonis benar atau salah. Periksa alasan dan buktinya di bawah.'))),
      el('h3', { class: 'label components__title' }, 'Rincian skor'),
      el('ol', { class: 'components' }, data.komponen.map(componentRow))));
}

function componentRow(part) {
  const bar = el('span', { class: 'bar', 'aria-hidden': 'true' });
  bar.style.setProperty('--fill', part.nilai / part.maks);
  return el('li', { class: 'component' },
    el('h4', { class: 'component__name' }, part.nama),
    el('p', { class: 'component__value' }, el('strong', {}, String(part.nilai)), ` / ${part.maks}`),
    bar,
    el('p', { class: 'component__reason' }, part.alasan));
}

function claimsSection(data) {
  return section(
    {
      id: 'klaim',
      label: '01 — Klaim utama',
      title: ['Tiga klaim ', el('em', {}, 'yang diperiksa.')],
    },
    el('ol', { class: 'claims' }, data.klaim_utama.map((claim, index) => claimItem(claim, index + 1, data))),
  );
}

function claimItem(claim, number, data) {
  const related = data.pembanding.filter((item) => item.klaim === number);
  return el('li', { class: 'claim' },
    el('span', { class: 'claim__num', 'aria-hidden': 'true' }, pad(number)),
    el('div', { class: 'claim__body' },
      el('blockquote', { class: 'claim__text' }, el('p', {}, claim.teks)),
      factcheckBox(claim.factcheck, data.demo),
      el('p', { class: 'label muted' }, coverageText(related))));
}

function factcheckBox(factcheck, demo) {
  if (!factcheck) {
    return el('div', { class: 'factcheck factcheck--none' },
      el('p', { class: 'label' }, 'Fact-check'),
      el('p', {}, 'Belum ada hasil fact-check yang terbit untuk klaim ini.'));
  }
  return el('div', { class: 'factcheck inverted' },
    el('p', { class: 'label muted' }, `Fact-check · ${factcheck.penerbit} · ${formatDate(factcheck.tanggal)}`),
    el('p', { class: 'factcheck__rating' }, 'Rating: ', el('strong', {}, factcheck.rating)),
    el('p', {}, sourceLink(factcheck.url, factcheck.judul, demo)));
}

function coverageText(related) {
  if (related.length === 0) return 'Tidak ditemukan artikel lain yang membahas klaim ini';
  const count = (stance) => related.filter((item) => item.sikap === stance).length;
  return `${related.length} artikel pembanding · ${count('mendukung')} mendukung · `
    + `${count('membantah')} membantah · ${count('netral')} netral`;
}

function comparisonsSection(data) {
  const sources = new Set(data.pembanding.map((item) => item.sumber)).size;
  const items = [...data.pembanding].sort((a, b) => a.klaim - b.klaim);
  return section(
    {
      id: 'pembanding',
      label: '02 — Artikel pembanding',
      title: ['Apa kata ', el('em', {}, 'media lain.')],
      intro: `${data.pembanding.length} artikel dari ${sources} media yang membahas klaim yang sama.`,
    },
    el('ol', { class: 'comparisons' }, items.map((item) => comparisonItem(item, data.demo))),
  );
}

function comparisonItem(item, demo) {
  return el('li', { class: 'comparison' },
    el('span', { class: `label stance stance--${item.sikap}` }, STANCES[item.sikap] ?? item.sikap),
    el('div', { class: 'comparison__body' },
      el('h3', { class: 'comparison__title' }, sourceLink(item.url, item.judul, demo)),
      el('p', { class: 'label comparison__meta' },
        `${item.sumber} · ${formatDate(item.tanggal)} · Klaim ${pad(item.klaim)}`),
      el('p', { class: 'comparison__note' }, item.catatan)));
}

function sentencesSection(data) {
  const total = data.kalimat.length;
  const claims = data.kalimat.filter((item) => item.jenis === 'klaim').length;

  const list = el('ol', { class: 'sentences', 'data-filter': 'semua' },
    data.kalimat.map((item) => el('li', { class: `sentence sentence--${item.jenis}` },
      el('span', { class: 'label sentence__type' }, item.jenis === 'klaim' ? 'Klaim' : 'Opini'),
      el('span', { class: 'sentence__text' }, item.teks))));

  const filters = [
    ['semua', 'Semua', total],
    ['klaim', 'Klaim faktual', claims],
    ['opini', 'Opini', total - claims],
  ].map(([value, text, count]) => el('button', {
    type: 'button',
    class: 'filter',
    'aria-pressed': String(value === 'semua'),
    'data-value': value,
  }, `${text} (${count})`));

  const group = el('div', { class: 'filters', role: 'group', 'aria-label': 'Saring kalimat' }, filters);
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    for (const filter of filters) filter.setAttribute('aria-pressed', String(filter === button));
    list.dataset.filter = button.dataset.value;
  });

  return section(
    {
      id: 'kalimat',
      label: '03 — Isi artikel',
      title: ['Klaim faktual ', el('em', {}, 'dan opini.')],
      intro: `${claims} dari ${total} kalimat berisi klaim yang bisa diperiksa. Kalimat opini ditulis miring.`,
    },
    group,
    list,
  );
}

function closingSection() {
  return el('section', { class: 'section inverted texture-radial', 'aria-labelledby': 'lagi-judul' },
    el('div', { class: 'container' },
      el('h2', { id: 'lagi-judul', class: 'display-title cta__title' }, 'Periksa ', el('em', {}, 'artikel lain.')),
      el('a', { class: 'btn', href: '/#periksa' }, 'Tempel link baru ', el('span', { 'aria-hidden': 'true' }, '→'))));
}

/* ---------- Other states ---------- */

function renderUnavailable(submittedUrl, examples) {
  document.title = 'Analisis belum aktif — Cek Kredibilitas';
  show(el('section', { class: 'section', 'aria-labelledby': 'belum-judul' },
    el('div', { class: 'container' },
      el('p', { class: 'label' }, 'Versi demo'),
      el('h1', { id: 'belum-judul', class: 'display-title unavailable__title' }, 'Analisis ', el('em', {}, 'belum aktif.')),
      el('p', { class: 'lead' },
        'Mesin analisis sedang dibangun, jadi link baru belum bisa diperiksa. '
        + 'Sementara itu, lihat contoh hasil untuk tiga artikel fiktif berikut.'),
      submittedUrl
        ? el('p', { class: 'unavailable__url' }, 'Link yang kamu kirim: ', submittedUrl)
        : null,
      el('ul', { class: 'demo-list' }, examples.map((item) => el('li', {},
        el('a', { class: 'demo-list__link', href: `/hasil.html?contoh=${encodeURIComponent(item.id)}` },
          el('span', { class: 'demo-list__title' }, item.judul),
          el('span', { class: 'label' }, item.domain, ' ', el('span', { 'aria-hidden': 'true' }, '→')))))))));
  statusLine.textContent = 'Analisis belum aktif untuk link ini.';
}

function renderError() {
  document.title = 'Gagal memuat — Cek Kredibilitas';
  show(el('section', { class: 'section' },
    el('div', { class: 'container' },
      el('p', { class: 'label' }, 'Galat'),
      el('h1', { class: 'display-title unavailable__title' }, 'Data ', el('em', {}, 'gagal dimuat.')),
      el('p', { class: 'lead' }, 'Periksa koneksi internet lalu muat ulang halaman ini.'))));
  statusLine.textContent = 'Data gagal dimuat.';
}

/* ---------- Helpers ---------- */

function show(...nodes) {
  root.replaceChildren(...nodes.filter(Boolean));
}

function section({ id, label, title, intro }, ...content) {
  const headingId = `${id}-judul`;
  return el('section', { id, class: 'section', 'aria-labelledby': headingId },
    el('div', { class: 'container' },
      el('header', { class: 'section-head' },
        el('p', { class: 'label' }, label),
        el('h2', { id: headingId, class: 'section-title' }, title),
        intro ? el('p', { class: 'section-head__intro' }, intro) : null),
      content));
}

function rule() {
  return el('hr', { class: 'rule' });
}

/* Evidence link. Demo data points at fictional .example URLs, so those render as text. */
function sourceLink(url, text, demo) {
  if (demo) {
    return el('span', { class: 'demo-link', title: 'Tautan fiktif (data contoh)' }, text);
  }
  return el('a', { class: 'link', href: url, target: '_blank', rel: 'noopener noreferrer' },
    text, el('span', { class: 'visually-hidden' }, ' (membuka tab baru)'));
}

function formatDate(iso) {
  return iso ? dateFormat.format(new Date(`${iso}T00:00:00`)) : null;
}

function pad(number) {
  return String(number).padStart(2, '0');
}

/* Small DOM builder: el('p', { class: 'x' }, 'text', childNode, [more]). */
function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}
