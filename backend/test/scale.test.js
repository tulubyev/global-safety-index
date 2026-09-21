'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { anchoredScale, logAnchoredScale, scaleMap } = require('../src/parsers/scale');

const FOOD = [[2.5, 0], [5, 20], [15, 50], [25, 75], [40, 100]];
const CONFLICT = [[0.01, 0], [0.1, 25], [1, 50], [10, 75], [100, 100]];

test('anchoredScale returns the anchor output at each anchor input', () => {
  for (const [x, y] of FOOD) assert.strictEqual(anchoredScale(x, FOOD), y);
});

test('anchoredScale interpolates linearly between anchors', () => {
  // halfway between 5->20 and 15->50
  assert.strictEqual(anchoredScale(10, FOOD), 35);
  // a quarter of the way from 25->75 to 40->100
  assert.ok(Math.abs(anchoredScale(28.75, FOOD) - 81.25) < 1e-9);
});

test('anchoredScale clamps outside the anchor range', () => {
  assert.strictEqual(anchoredScale(0, FOOD), 0);
  assert.strictEqual(anchoredScale(-5, FOOD), 0);
  assert.strictEqual(anchoredScale(1000, FOOD), 100);
});

test('anchoredScale treats non-numbers as the lowest anchor', () => {
  for (const v of [NaN, undefined, null, 'abc', Infinity]) {
    assert.strictEqual(anchoredScale(v, FOOD), 0, `failed for ${String(v)}`);
  }
});

test('logAnchoredScale steps once per order of magnitude', () => {
  assert.strictEqual(logAnchoredScale(0.1, CONFLICT), 25);
  assert.strictEqual(logAnchoredScale(1, CONFLICT), 50);
  assert.strictEqual(logAnchoredScale(10, CONFLICT), 75);
  // geometric midpoint of 1 and 10 sits halfway between 50 and 75
  assert.ok(Math.abs(logAnchoredScale(Math.sqrt(10), CONFLICT) - 62.5) < 1e-9);
});

test('logAnchoredScale maps zero and negatives to the first anchor', () => {
  assert.strictEqual(logAnchoredScale(0, CONFLICT), 0);
  assert.strictEqual(logAnchoredScale(-1, CONFLICT), 0);
});

test('scale is absolute: a value maps the same regardless of the batch', () => {
  const alone = scaleMap(new Map([['A', 10]]), v => anchoredScale(v, FOOD));
  const crowd = scaleMap(new Map([['A', 10], ['B', 0.1], ['C', 99]]), v => anchoredScale(v, FOOD));
  assert.strictEqual(alone.get('A'), crowd.get('A'));
});

test('scaleMap clamps to 0..100 and rounds to two decimals', () => {
  const out = scaleMap(new Map([['A', 1], ['B', 2]]), v => (v === 1 ? 123.456 : -7));
  assert.strictEqual(out.get('A'), 100);
  assert.strictEqual(out.get('B'), 0);
  assert.strictEqual(scaleMap(new Map([['A', 1]]), () => 12.3456).get('A'), 12.35);
});
