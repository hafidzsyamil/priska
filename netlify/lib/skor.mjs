/*
 * Step 5: the score. Computed here from the labelled signals, never by the model,
 * so every point can be traced to a rule and a reason. The same rules are described
 * on the home page under "Metode skor".
 */

export const MAX = { dukungan: 35, factcheck: 25, porsi: 15, transparansi: 25 };

/* Share of the fact-check component for each verdict; 0.6 (15 of 25) when there is none. */
export const VERDICT_VALUE = { benar: 1, sebagian_benar: 0.5, tidak_jelas: 0.6, menyesatkan: 0.2, salah: 0 };
export const NO_FACTCHECK = 0.6;

/* Share of the support component for a claim no other outlet covered. */
export const NO_COVERAGE = 0.25;

export const AUTHOR_POINTS = { orang: 7, redaksi: 3, tidak_ada: 0 };
export const DATE_POINTS = 6;
export const POINTS_PER_SOURCE = 4;
export const MAX_SOURCES = 3;

/*
 * claims:        [{ pembanding: [{ sikap, sumber }], factcheck: { vonis, penerbit, rating } | null }]
 * sentenceKinds: ['klaim' | 'opini', ...]
 * failed:        { factcheck: boolean, pembanding: boolean } — a search service was unavailable
 */
export function computeScore({ claims, sentenceKinds, penulis, penulisJenis, adaTanggal, sumberDisebut, failed = {} }) {
  const support = supportComponent(claims, failed.pembanding);
  const factcheck = factcheckComponent(claims, failed.factcheck);
  const share = shareComponent(sentenceKinds);
  const transparency = transparencyComponent({ penulis, penulisJenis, adaTanggal, sumberDisebut });
  const komponen = [support, factcheck, share, transparency].map(({ ratio, ...part }) => part);
  const total = komponen.reduce((sum, part) => sum + part.nilai, 0);
  return { komponen, total, ringkasan: summary(claims, support.ratio, transparency.nilai) };
}

function supportComponent(claims, searchFailed) {
  const nama = 'Dukungan sumber lain';
  if (!claims.length) {
    return {
      nama, nilai: Math.round(MAX.dukungan * NO_COVERAGE), maks: MAX.dukungan, ratio: NO_COVERAGE,
      alasan: 'Artikel tidak memuat klaim faktual yang bisa dicek silang ke media lain.',
    };
  }
  const ratios = claims.map(({ pembanding }) => {
    if (!pembanding.length) return NO_COVERAGE;
    const count = countStances(pembanding);
    return (count.mendukung + 0.5 * count.netral) / pembanding.length;
  });
  const ratio = mean(ratios);
  const all = claims.flatMap((claim) => claim.pembanding);
  const count = countStances(all);
  const outlets = new Set(all.map((item) => item.sumber)).size;
  const uncovered = claims.filter((claim) => !claim.pembanding.length).length;

  let alasan;
  if (searchFailed && !all.length) {
    alasan = 'Pencarian artikel pembanding sedang gagal, jadi klaim utama dianggap belum dibahas media lain.';
  } else if (!all.length) {
    alasan = 'Tidak ditemukan artikel dari media lain yang membahas klaim utama.';
  } else {
    alasan = `${all.length} artikel dari ${outlets} media lain membahas klaim utama: `
      + `${count.mendukung} mendukung, ${count.membantah} membantah, ${count.netral} netral.`;
    if (uncovered) alasan += ` ${uncovered} dari ${claims.length} klaim utama tidak ditemukan di media lain.`;
  }
  return { nama, nilai: Math.round(MAX.dukungan * ratio), maks: MAX.dukungan, ratio, alasan };
}

function factcheckComponent(claims, searchFailed) {
  const nama = 'Fact-check yang ada';
  const values = claims.map(({ factcheck }) => (factcheck ? VERDICT_VALUE[factcheck.vonis] ?? NO_FACTCHECK : NO_FACTCHECK));
  const nilai = Math.round(MAX.factcheck * (values.length ? mean(values) : NO_FACTCHECK));
  const checked = claims
    .map((claim, index) => ({ ...claim.factcheck, nomor: index + 1 }))
    .filter((item) => item.vonis);

  let alasan;
  if (!checked.length) {
    alasan = searchFailed
      ? 'Pencarian fact-check sedang gagal, jadi komponen ini diberi nilai netral.'
      : 'Belum ada fact-check untuk klaim utama artikel ini, jadi komponen ini diberi nilai netral.';
  } else {
    alasan = checked.map((item) => `Klaim ${pad(item.nomor)} sudah diperiksa ${item.penerbit} dengan rating "${item.rating}".`).join(' ');
    if (checked.length < claims.length) alasan += ' Klaim lain belum pernah diperiksa, jadi diberi nilai netral.';
  }
  return { nama, nilai, maks: MAX.factcheck, alasan };
}

function shareComponent(sentenceKinds) {
  const total = sentenceKinds.length;
  const claims = sentenceKinds.filter((kind) => kind === 'klaim').length;
  const opinions = total - claims;
  return {
    nama: 'Porsi klaim faktual',
    nilai: total ? Math.round(MAX.porsi * (claims / total)) : 0,
    maks: MAX.porsi,
    alasan: `${claims} dari ${total} kalimat berisi klaim yang bisa diperiksa. `
      + (opinions ? `${opinions} kalimat lain berupa opini, penilaian, atau ajakan.` : 'Tidak ada kalimat opini.'),
  };
}

function transparencyComponent({ penulis, penulisJenis, adaTanggal, sumberDisebut }) {
  const kind = penulisJenis in AUTHOR_POINTS ? penulisJenis : 'tidak_ada';
  const sources = sumberDisebut.length;
  const nilai = AUTHOR_POINTS[kind] + (adaTanggal ? DATE_POINTS : 0) + POINTS_PER_SOURCE * Math.min(MAX_SOURCES, sources);

  const author = {
    orang: `Nama penulis tercantum${penulis ? ` (${penulis})` : ''}.`,
    redaksi: 'Penulis hanya dicantumkan sebagai redaksi atau tim, bukan nama orang.',
    tidak_ada: 'Nama penulis tidak dicantumkan.',
  }[kind];
  const date = adaTanggal ? 'Tanggal terbit tercantum.' : 'Tanggal terbit tidak dicantumkan.';
  const shown = sources > 4 ? [...sumberDisebut.slice(0, 4), `${sources - 4} lainnya`] : sumberDisebut;
  const named = sources
    ? `Narasumber atau data yang disebut: ${listJoin(shown)}.`
    : 'Tidak ada narasumber atau data yang disebut dengan jelas.';

  return { nama: 'Transparansi sumber', nilai, maks: MAX.transparansi, alasan: `${author} ${date} ${named}` };
}

function summary(claims, supportRatio, transparency) {
  const judged = claims.filter((claim) => ['salah', 'menyesatkan'].includes(claim.factcheck?.vonis)).length;
  const refuted = claims.filter((claim) => claim.pembanding.some((item) => item.sikap === 'membantah')).length;
  const uncovered = claims.filter((claim) => !claim.pembanding.length).length;

  let first;
  if (!claims.length) first = 'Artikel ini hampir seluruhnya berisi opini, tanpa klaim faktual yang bisa dicek silang.';
  else if (judged) first = `${COUNT_WORDS[judged]} klaim utamanya sudah dinilai keliru atau menyesatkan oleh pemeriksa fakta.`;
  else if (refuted) first = 'Ada klaim utama yang dibantah oleh liputan media lain.';
  else if (uncovered * 2 > claims.length) first = 'Sebagian besar klaim utamanya belum dibahas media lain, jadi sulit dicek silang.';
  else if (supportRatio >= 0.75) first = 'Klaim utama artikel ini konsisten dengan liputan media lain.';
  else first = 'Klaim utama artikel ini hanya sebagian didukung liputan media lain.';

  if (transparency >= 20) return `${first} Sumber informasinya disebut dengan jelas.`;
  if (transparency < 13) return `${first} Penulis atau sumber informasinya kurang jelas.`;
  return first;
}

const COUNT_WORDS = ['Tidak ada', 'Satu', 'Dua', 'Tiga'];

function countStances(items) {
  const count = { mendukung: 0, membantah: 0, netral: 0 };
  for (const { sikap } of items) if (sikap in count) count[sikap] += 1;
  return count;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function listJoin(items) {
  if (items.length < 3) return items.join(' dan ');
  return `${items.slice(0, -1).join(', ')}, dan ${items.at(-1)}`;
}

function pad(number) {
  return String(number).padStart(2, '0');
}
