'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  DIMENSIONS, DEFAULT_WEIGHTS, normalizeWeights, rawScore, scoreFromRaw, compositeScore,
  hasValue, coverage,
} = require('../src/services/scoreService');

const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

test('default weights sum to 1', () => {
  assert.ok(Math.abs(sum(DEFAULT_WEIGHTS) - 1) < 1e-9);
  assert.deepStrictEqual(Object.keys(DEFAULT_WEIGHTS).sort(), [...DIMENSIONS].sort());
});

test('normalizeWeights rescales any non-negative set to sum 1', () => {
  const w = normalizeWeights({ conflict: 30, crime: 10, disaster: 0, food: 0, seismic: 0, pandemic: 0 });
  assert.ok(Math.abs(sum(w) - 1) < 1e-9);
  assert.ok(Math.abs(w.conflict - 0.75) < 1e-9);
});

test('normalizeWeights treats negatives as zero and all-zero as defaults', () => {
  const w = normalizeWeights({ conflict: -5, crime: 5 });
  assert.strictEqual(w.conflict, 0);
  assert.strictEqual(w.crime, 1);
  assert.deepStrictEqual(normalizeWeights({}), { ...DEFAULT_WEIGHTS });
});

test('scoreFromRaw anchors the ends and bends the middle upward', () => {
  assert.strictEqual(scoreFromRaw(0), 0);
  assert.strictEqual(scoreFromRaw(100), 100);
  assert.strictEqual(scoreFromRaw(25), 50);
  assert.ok(scoreFromRaw(10) > 10, 'sqrt must lift low values so they stay distinguishable');
});

test('rawScore stays inside 0..100 and ignores unknown keys', () => {
  const all100 = Object.fromEntries(DIMENSIONS.map(d => [d, 100]));
  assert.ok(Math.abs(rawScore(all100) - 100) < 1e-9);
  assert.strictEqual(rawScore({}), 0);
  assert.strictEqual(rawScore({ ...all100, nonsense: 1e6 }), 100);
});

test('a missing dimension is dropped and the rest reweighted, not treated as zero', () => {
  const w = { conflict: 50, crime: 50, disaster: 0, food: 0, seismic: 0, pandemic: 0 };
  // crime unknown -> score rests entirely on conflict
  assert.strictEqual(rawScore({ conflict: 100 }, w), 100);
  // crime measured at 0 -> it counts, and drags the mean down
  assert.strictEqual(rawScore({ conflict: 100, crime: 0 }, w), 50);
});

test('a measured zero is not the same as no data', () => {
  assert.strictEqual(hasValue(0), true);
  assert.strictEqual(hasValue('0.0'), true);
  for (const v of [null, undefined, '', NaN, 'n/a']) assert.strictEqual(hasValue(v), false);
});

test('coverage counts dimensions that carry a measurement', () => {
  assert.strictEqual(coverage({}), 0);
  assert.strictEqual(coverage({ conflict: 0, crime: null }), 1);
  assert.strictEqual(coverage(Object.fromEntries(DIMENSIONS.map(d => [d, 5]))), DIMENSIONS.length);
});

test('missing data neither inflates nor deflates the score', () => {
  const partial = { conflict: 40, crime: 40 };
  const full    = Object.fromEntries(DIMENSIONS.map(d => [d, 40]));
  assert.ok(Math.abs(rawScore(partial) - rawScore(full)) < 1e-9,
    'same values, fewer dimensions: the score must not move');
});

test('no data at all scores zero rather than throwing', () => {
  assert.strictEqual(rawScore({ conflict: null, crime: undefined }), 0);
});

test('compositeScore equals scoreFromRaw(rawScore)', () => {
  const dims = { conflict: 40, crime: 10, disaster: 20, food: 0, seismic: 60, pandemic: 5 };
  assert.strictEqual(compositeScore(dims), scoreFromRaw(rawScore(dims)));
});

test('zeroing every weight but one isolates that dimension', () => {
  const only = d => Object.fromEntries(DIMENSIONS.map(x => [x, x === d ? 1 : 0]));
  const dims = Object.fromEntries(DIMENSIONS.map((d, i) => [d, i * 10]));
  for (const d of DIMENSIONS) {
    assert.strictEqual(compositeScore(dims, only(d)), scoreFromRaw(dims[d]));
  }
});
