/*
 * Results page.
 *
 * ?contoh=<id> shows a demo result from /data/contoh/. ?url=<link> (from the check
 * form) shows the matching demo if there is one, otherwise asks /api/analisis
 * (netlify/functions/analisis.mjs) to check the article. Both return the same JSON
 * shape. Every failure gets its own honest message plus links to the demos.
 *
 * All text from the data is inserted with textContent, never as HTML, because
 * real results contain text scraped from third-party articles.
 */

'use strict';

const DATA_DIR = '/data/contoh/';

/* Part of the API cache key. Bump when the result format or scoring rules change. */
const API_VERSION = '1';
const API_TIMEOUT_MS = 75_000;

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

const COUNT_WORDS = ['Tidak ada', 'Satu', 'Dua', 'Tiga'];

const STEPS = [
  ['01', 'Ekstraksi', 'Mengambil judul, penulis, tanggal, dan isi artikel.'],
  ['02', 'Pemisahan', 'Memberi label klaim atau opini pada setiap kalimat.'],
  ['03', 'Pencocokan', 'Mencari fact-check dan artikel lain yang membahas klaim yang sama.'],
  ['04', 'Penilaian', 'Menghitung skor beserta alasannya.'],
];

const FAILURES = {
  tanpa_link: {
    label: 'Belum ada link',
    title: ['Tempel ', el('em', {}, 'link dulu.')],
    text: 'Tempel link artikel berita di halaman depan untuk memulai, atau lihat contoh hasil berikut.',
  },
  belum_aktif: {
    label: 'Versi demo',
    title: ['Analisis ', el('em', {}, 'belum aktif.')],
    text: 'Mesin analisis sedang disiapkan, jadi link baru belum bisa diperiksa. '
      + 'Sementara itu, lihat contoh hasil untuk tiga artikel fiktif berikut.',
  },
  link_tidak_valid: {
    label: 'Tidak bisa dianalisis',
    title: ['Link ', el('em', {}, 'tidak valid.')],
    text: 'Tempel alamat lengkap artikel berita, diawali https://.',
  },
  artikel_tidak_terbaca: {
    label: 'Tidak bisa dianalisis',
    title: ['Artikel ', el('em', {}, 'tidak terbaca.')],
    text: 'Isi artikel tidak bisa dibaca dari link ini.',
  },
  kuota_habis: {
    label: 'Tidak bisa dianalisis',
    title: ['Kuota ', el('em', {}, 'habis.')],
    text: 'Kuota analisis hari ini sudah habis. Coba lagi besok, atau lihat contoh hasil.',
  },
  terlalu_sering: {
    label: 'Tidak bisa dianalisis',
    title: ['Tunggu ', el('em', {}, 'sebentar.')],
    text: 'Terlalu banyak permintaan dalam satu menit. Tunggu sebentar, lalu coba lagi.',
    retry: true,
  },
  waktu_habis: {
    label: 'Tidak bisa dianalisis',
    title: ['Waktu ', el('em', {}, 'habis.')],
    text: 'Analisis memakan waktu terlalu lama. Coba lagi beberapa saat lagi.',
    retry: true,
  },
  ai_sibuk: {
    label: 'Tidak bisa dianalisis',
    title: ['Layanan AI ', el('em', {}, 'sedang sibuk.')],
    text: 'Layanan AI sedang sibuk melayani banyak permintaan. Coba lagi dalam beberapa menit.',
    retry: true,
  },
  layanan_gagal: {
    label: 'Tidak bisa dianalisis',
    title: ['Analisis ', el('em', {}, 'gagal.')],
    text: 'Salah satu layanan analisis sedang bermasalah. Coba lagi beberapa saat lagi.',
    retry: true,
  },
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

  let examples;
  try {
    examples = await fetchJson(`${DATA_DIR}index.json`);
  } catch (error) {
    console.error(error);
    renderError();
    return;
  }

  const match = exampleId
    ? examples.find((item) => item.id === exampleId)
    : examples.find((item) => sameArticle(item.url, submittedUrl));

  if (match) {
    try {
      renderResult(await fetchJson(`${DATA_DIR}${match.id}.json`));
    } catch (error) {
      console.error(error);
      renderError();
    }
  } else if (submittedUrl) {
    await analyse(submittedUrl, examples);
  } else {
    renderFailure('tanpa_link', null, null, examples);
  }
}

async function analyse(submittedUrl, examples) {
  const url = normalizeArticleUrl(submittedUrl);
  if (!url) {
    renderFailure('link_tidak_valid', null, submittedUrl, examples);
    return;
  }

  const stopProgress = renderProgress(url);
  let response = null;
  let body = null;
  let timedOut = false;
  try {
    const query = new URLSearchParams({ url, v: API_VERSION });
    response = await fetch(`/api/analisis?${query}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    body = await response.json().catch(() => null);
  } catch (error) {
    console.error(error);
    timedOut = error.name === 'TimeoutError';
  }
  stopProgress();

  if (response?.ok && Array.isArray(body?.komponen)) {
    renderResult(body);
    return;
  }
  renderFailure(failureCode(response, body, timedOut), body?.pesan, url, examples);
}

function failureCode(response, body, timedOut) {
  if (!response) return timedOut ? 'waktu_habis' : 'layanan_gagal';
  if (response.status === 404 || response.status === 503) return 'belum_aktif';
  if (body?.galat in FAILURES) return body.galat;
  if (response.status === 429) return 'terlalu_sering';
  if (response.status === 504) return 'waktu_habis';
  return 'layanan_gagal';
}

/* Same clean-up as the server: http(s) only, no fragment, no tracking parameters. */
function normalizeArticleUrl(raw) {
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_\w+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return null;
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
        el('li', {}, analysedText(data))),
      el('p', { class: 'article-head__url' }, sourceLink(artikel.url, artikel.url, data.demo)),
      data.catatan?.length
        ? el('div', { class: 'notes' },
          el('p', { class: 'label' }, 'Catatan'),
          el('ul', { class: 'notes__list' }, data.catatan.map((note) => el('li', {}, note))))
        : null));
}

function analysedText(data) {
  const duration = `dalam ${numberFormat.format(data.durasi_detik)} detik`;
  return data.dianalisis ? `Dianalisis ${formatDate(data.dianalisis)} ${duration}` : `Dianalisis ${duration}`;
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
  const count = data.klaim_utama.length;
  return section(
    {
      id: 'klaim',
      label: '01 — Klaim utama',
      title: [`${COUNT_WORDS[count] ?? count} klaim `, el('em', {}, count ? 'yang diperiksa.' : 'untuk diperiksa.')],
      intro: count ? null : 'Artikel ini tidak memuat klaim faktual yang bisa dicek silang ke media lain.',
    },
    count ? el('ol', { class: 'claims' }, data.klaim_utama.map((claim, index) => claimItem(claim, index + 1, data))) : null,
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
    el('p', { class: 'label muted' }, joinParts('Fact-check', factcheck.penerbit, formatDate(factcheck.tanggal))),
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
      intro: items.length
        ? `${items.length} artikel dari ${sources} media yang membahas klaim yang sama.`
        : 'Tidak ditemukan artikel dari media lain yang membahas klaim utama artikel ini.',
    },
    items.length ? el('ol', { class: 'comparisons' }, items.map((item) => comparisonItem(item, data.demo))) : null,
  );
}

function comparisonItem(item, demo) {
  return el('li', { class: 'comparison' },
    el('span', { class: `label stance stance--${item.sikap}` }, STANCES[item.sikap] ?? item.sikap),
    el('div', { class: 'comparison__body' },
      el('h3', { class: 'comparison__title' }, sourceLink(item.url, item.judul, demo)),
      el('p', { class: 'label comparison__meta' },
        joinParts(item.sumber, formatDate(item.tanggal), `Klaim ${pad(item.klaim)}`)),
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

function renderProgress(url) {
  document.title = 'Menganalisis… — Cek Kredibilitas';
  const seconds = el('span', {}, '0');
  show(el('section', { class: 'section', 'aria-labelledby': 'proses-judul' },
    el('div', { class: 'container' },
      el('p', { class: 'label' }, 'Sedang dianalisis · ', seconds, ' detik'),
      el('h1', { id: 'proses-judul', class: 'display-title unavailable__title' }, 'Sedang ', el('em', {}, 'diperiksa.')),
      el('p', { class: 'unavailable__url' }, url),
      el('ol', { class: 'progress-steps' }, STEPS.map(([number, name, text]) => el('li', { class: 'progress-step' },
        el('span', { class: 'label' }, number),
        el('span', { class: 'progress-step__name' }, name),
        el('span', { class: 'progress-step__text' }, text)))),
      el('p', { class: 'progress-note' }, 'Biasanya selesai dalam 15–30 detik. Biarkan halaman ini tetap terbuka.'))));
  statusLine.textContent = 'Artikel sedang dianalisis. Biasanya selesai dalam 15 sampai 30 detik.';

  const started = Date.now();
  const timer = setInterval(() => {
    seconds.textContent = String(Math.floor((Date.now() - started) / 1000));
  }, 1000);
  return () => clearInterval(timer);
}

function renderFailure(code, serverMessage, url, examples) {
  const failure = FAILURES[code] ?? FAILURES.layanan_gagal;
  const text = code === 'belum_aktif' || !serverMessage ? failure.text : serverMessage;
  const heading = failure.title.map((part) => (typeof part === 'string' ? part : part.textContent)).join('');
  document.title = `${heading.replace(/\.$/, '')} — Cek Kredibilitas`;
  show(el('section', { class: 'section', 'aria-labelledby': 'gagal-judul' },
    el('div', { class: 'container' },
      el('p', { class: 'label' }, failure.label),
      el('h1', { id: 'gagal-judul', class: 'display-title unavailable__title' }, failure.title),
      el('p', { class: 'lead' }, text),
      url ? el('p', { class: 'unavailable__url' }, 'Link yang kamu kirim: ', url) : null,
      el('div', { class: 'actions' },
        failure.retry ? el('a', { class: 'btn', href: window.location.href }, 'Coba lagi') : null,
        el('a', { class: failure.retry ? 'btn btn--outline' : 'btn', href: '/#periksa' },
          'Periksa link lain ', el('span', { 'aria-hidden': 'true' }, '→'))),
      el('p', { class: 'label demo-list__heading' }, 'Contoh hasil'),
      el('ul', { class: 'demo-list' }, examples.map((item) => el('li', {},
        el('a', { class: 'demo-list__link', href: `/hasil.html?contoh=${encodeURIComponent(item.id)}` },
          el('span', { class: 'demo-list__title' }, item.judul),
          el('span', { class: 'label' }, item.domain, ' ', el('span', { 'aria-hidden': 'true' }, '→')))))))));
  statusLine.textContent = text;
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

/*
 * Evidence link. Demo data points at fictional .example URLs, so those render as text.
 * Real links come from third-party APIs, so anything but http(s) is rendered as text too.
 */
function sourceLink(url, text, demo) {
  if (demo) {
    return el('span', { class: 'demo-link', title: 'Tautan fiktif (data contoh)' }, text);
  }
  if (!/^https?:\/\//i.test(url ?? '')) return el('span', {}, text);
  return el('a', { class: 'link', href: url, target: '_blank', rel: 'noopener noreferrer' },
    text, el('span', { class: 'visually-hidden' }, ' (membuka tab baru)'));
}

function formatDate(iso) {
  const day = typeof iso === 'string' ? iso.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? dateFormat.format(new Date(`${day}T00:00:00`)) : null;
}

function joinParts(...parts) {
  return parts.filter(Boolean).join(' · ');
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
