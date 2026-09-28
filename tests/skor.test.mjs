import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { computeScore } from '../netlify/lib/skor.mjs';
import { DEMO_SIGNALS, scoreInputFor } from './demo-signals.mjs';

const demoPath = (id) => new URL(`../public/data/contoh/${id}.json`, import.meta.url);

for (const [id, signals] of Object.entries(DEMO_SIGNALS)) {
  test(`demo "${id}" shows exactly what the scoring rules compute`, () => {
    const demo = JSON.parse(fs.readFileSync(demoPath(id), 'utf8'));
    const score = computeScore(scoreInputFor(demo, signals));
    assert.deepEqual(demo.komponen, score.komponen);
    assert.equal(demo.ringkasan, score.ringkasan);
  });
}

test('home page example cards match the demo totals', () => {
  const home = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const id of Object.keys(DEMO_SIGNALS)) {
    const demo = JSON.parse(fs.readFileSync(demoPath(id), 'utf8'));
    const total = demo.komponen.reduce((sum, part) => sum + part.nilai, 0);
    const card = home.match(new RegExp(`contoh=${id}"[^>]*>\\s*<span class="example__score">(\\d+)</span>`));
    assert.ok(card, `card for ${id}`);
    assert.equal(Number(card[1]), total, id);
  }
});

const base = {
  claims: [],
  sentenceKinds: ['klaim', 'opini'],
  penulis: null,
  penulisJenis: 'tidak_ada',
  adaTanggal: false,
  sumberDisebut: [],
};

test('no main claims: support gets the no-coverage share, fact-check stays neutral', () => {
  const { komponen, total } = computeScore(base);
  assert.deepEqual(komponen.map((part) => part.nilai), [9, 15, 8, 0]);
  assert.equal(total, 32);
});

test('uncovered claims and failed searches are explained, not hidden', () => {
  const { komponen } = computeScore({
    ...base,
    claims: [{ pembanding: [], factcheck: null }],
    failed: { factcheck: true, pembanding: true },
  });
  assert.match(komponen[0].alasan, /Pencarian artikel pembanding sedang gagal/);
  assert.match(komponen[1].alasan, /Pencarian fact-check sedang gagal/);
});

test('transparency caps named sources at three', () => {
  const { komponen } = computeScore({
    ...base,
    penulis: 'Rina',
    penulisJenis: 'orang',
    adaTanggal: true,
    sumberDisebut: ['A', 'B', 'C', 'D', 'E', 'F'],
  });
  assert.equal(komponen[3].nilai, 25);
  assert.match(komponen[3].alasan, /A, B, C, D, dan 2 lainnya/);
});
