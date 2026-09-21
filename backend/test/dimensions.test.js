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
    new Map([['A', 100], ['B', 100]]),
    new Map([['A', 1e6], ['B', 0]]),   // B has no usable population
  );
  assert.deepStrictEqual([...out.keys()], ['A']);
});

test('a country absent from the conflict data scores a measured zero, not unknown', () => {
  // UCDP covers the world: no entry means no recorded organized violence.
  const out = conflictRateMap(new Map([['A', 500]]), new Map([['A', 1e6], ['PEACE', 1e6]]));
  assert.strictEqual(out.get('PEACE'), 0);
  assert.ok(out.has('PEACE'), 'must be present with 0, not omitted');
  assert.ok(out.get('A') > 0);
});

test('blendMaps is anchored on the structural index, not the event feed', () => {
  const out = blendMaps(
    new Map([['A', 100], ['C', 50]]), 0.8,
    new Map([['A', 100], ['B', 50]]), 0.2,
  );
  assert.strictEqual(out.get('A'), 100);          // 80 + 20
  assert.strictEqual(out.get('C'), 40);           // 40 + 0, no events this month
  assert.strictEqual(out.has('B'), false,
    'an event with no structural assessment cannot stand in for one');
  assert.strictEqual(out.size, 2);
});

test('blendMaps never exceeds 100', () => {
  const out = blendMaps(new Map([['A', 100]]), 1.0, new Map([['A', 100]]), 1.0);
  assert.strictEqual(out.get('A'), 100);
});

const { foodMap, FOOD_FIES_ANCHORS, FOOD_DEFC_ANCHORS } = require('../src/cron/dimensions');
const { anchoredScale } = require('../src/parsers/scale');

test('foodMap prefers FIES and falls back to undernourishment', () => {
  const { map, via } = foodMap(
    new Map([['DE', 4.1], ['NO', 7.8]]),          // FIES
    new Map([['DE', 2.5], ['IN', 12.0]]),         // undernourishment
    anchoredScale,
  );
  assert.strictEqual(via.get('DE'), 'fies', 'FIES must win where both exist');
  assert.strictEqual(via.get('NO'), 'fies');
  assert.strictEqual(via.get('IN'), 'undernourishment', 'fallback covers what FIES misses');
  assert.strictEqual(map.size, 3);
});

test('FIES separates countries that undernourishment cannot', () => {
  // Germany, Norway, USA and Russia all sit on the 2.5% undernourishment floor
  const floor = [2.5, 2.5, 2.5, 2.5].map(v => anchoredScale(v, FOOD_DEFC_ANCHORS));
  assert.deepStrictEqual(floor, [0, 0, 0, 0], 'the censored indicator collapses them to one value');

  const fies = [4.1, 7.8, 10.3, 2.8].map(v => anchoredScale(v, FOOD_FIES_ANCHORS));
  assert.strictEqual(new Set(fies).size, 4, 'FIES gives each of them a distinct value');
  assert.ok(fies.every(v => v >= 0 && v <= 100));
});
