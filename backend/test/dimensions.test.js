'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  CONFLICT_DECAY_WINDOW, wbToIso2Map, conflictRateMap, blendMaps,
} = require('../src/cron/dimensions');

test('wbToIso2Map converts iso3 to iso2 and drops unknown codes', () => {
  const m = wbToIso2Map([
    { code3: 'USA', value: 5 },
    { code3: 'FRA', value: 7 },
    { code3: 'ZZZ', value: 9 },   // not a country
    { code3: '',    value: 1 },
  ]);
  assert.strictEqual(m.get('US'), 5);
  assert.strictEqual(m.get('FR'), 7);
  assert.strictEqual(m.size, 2);
});

test('conflictRateMap converts a decay-weighted total into deaths per 100k per year', () => {
  // 1000 weighted deaths in a country of 10M
  const out = conflictRateMap(new Map([['XX', 1000]]), new Map([['XX', 10e6]]));
  const expected = (1000 / CONFLICT_DECAY_WINDOW) / 10e6 * 100000;
  assert.ok(Math.abs(out.get('XX') - expected) < 1e-9);
  assert.ok(out.get('XX') > 3 && out.get('XX') < 4, 'sanity: ~3.5 per 100k/yr');
});

test('conflictRateMap ranks a small country above a large one at equal death counts', () => {
  const out = conflictRateMap(
    new Map([['SMALL', 1000], ['BIG', 1000]]),
    new Map([['SMALL', 1e6], ['BIG', 100e6]]),
  );
  assert.ok(out.get('SMALL') > out.get('BIG'));
  assert.ok(Math.abs(out.get('SMALL') / out.get('BIG') - 100) < 1e-6);
});

test('conflictRateMap drops countries with no usable population', () => {
  const out = conflictRateMap(
    new Map([['A', 100], ['B', 100], ['C', 100]]),
    new Map([['A', 1e6], ['B', 0]]),   // B is zero, C is absent
  );
  assert.deepStrictEqual([...out.keys()], ['A']);
});

test('blendMaps weights structural and event components over the union of keys', () => {
  const out = blendMaps(
    new Map([['A', 100], ['C', 50]]), 0.8,
    new Map([['A', 100], ['B', 50]]), 0.2,
  );
  assert.strictEqual(out.get('A'), 100);          // 80 + 20
  assert.strictEqual(out.get('B'), 10);           // absent structurally -> 0 + 10
  assert.strictEqual(out.get('C'), 40);           // 40 + 0
  assert.strictEqual(out.size, 3);
});

test('blendMaps never exceeds 100', () => {
  const out = blendMaps(new Map([['A', 100]]), 1.0, new Map([['A', 100]]), 1.0);
  assert.strictEqual(out.get('A'), 100);
});
