/*
 * The labelled signals behind each demo result in public/data/contoh/. The demo
 * scores and reasons must equal what netlify/lib/skor.mjs computes from these,
 * so the demos show the real scoring method (checked by skor.test.mjs).
 */

export const DEMO_SIGNALS = {
  'halte-listrik': {
    penulisJenis: 'orang',
    sumberDisebut: ['Wali Kota Sukamaju', 'Dinas Perhubungan', 'APBD 2026'],
    vonis: {},
  },
  'harga-cabai': {
    penulisJenis: 'redaksi',
    sumberDisebut: ['Pemkot Sukamaju'],
    vonis: {},
  },
  'daun-sirsak': {
    penulisJenis: 'tidak_ada',
    sumberDisebut: [],
    vonis: { 1: 'salah', 2: 'menyesatkan' },
  },
};

/* Builds computeScore() input from a demo result file plus its signals. */
export function scoreInputFor(result, signals) {
  return {
    claims: result.klaim_utama.map((claim, index) => ({
      factcheck: claim.factcheck && { ...claim.factcheck, vonis: signals.vonis[index + 1] },
      pembanding: result.pembanding.filter((item) => item.klaim === index + 1),
    })),
    sentenceKinds: result.kalimat.map((item) => item.jenis),
    penulis: signals.penulisJenis === 'orang' ? result.artikel.penulis : null,
    penulisJenis: signals.penulisJenis,
    adaTanggal: Boolean(result.artikel.tanggal),
    sumberDisebut: signals.sumberDisebut,
  };
}
