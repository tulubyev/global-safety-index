'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { placeToIso2, usgsToIso2Map } = require('../src/parsers/usgsParser');

test('longer country names win over shorter ones they contain', () => {
  // These four all resolved to the wrong country before word-boundary matching
  assert.strictEqual(placeToIso2('Nigeria'), 'NG');       // not Niger
  assert.strictEqual(placeToIso2('12 km S of Somalia'), 'SO'); // not Mali
  assert.strictEqual(placeToIso2('near Romania'), 'RO');  // not Oman
  assert.strictEqual(placeToIso2('Papua New Guinea'), 'PG');
});

test('short names still resolve on their own', () => {
  assert.strictEqual(placeToIso2('Niger'), 'NE');
  assert.strictEqual(placeToIso2('Mali'), 'ML');
  assert.strictEqual(placeToIso2('Oman'), 'OM');
});

test('USGS place strings resolve to the trailing country', () => {
  assert.strictEqual(placeToIso2('113 km E of Kokopo, Papua New Guinea'), 'PG');
  assert.strictEqual(placeToIso2('South of the Fiji Islands'), 'FJ');
  assert.strictEqual(placeToIso2('Türkiye'), 'TR');
});

test('unknown places resolve to null rather than a wrong guess', () => {
  assert.strictEqual(placeToIso2('Indiana'), null);   // must not match India
  assert.strictEqual(placeToIso2('Guinea'), null);    // not in the table on its own
  assert.strictEqual(placeToIso2(''), null);
});

test('usgsToIso2Map sums energy per country and returns log10', () => {
  const m = usgsToIso2Map([
    { placeName: 'Japan', energy: 1e6 },
    { placeName: 'Japan', energy: 9e6 },
    { placeName: 'Atlantis', energy: 1e9 },
  ]);
  assert.ok(Math.abs(m.get('JP') - 7) < 1e-9);  // log10(1e7)
  assert.strictEqual(m.size, 1);
});

test('log compression keeps one huge quake from dwarfing everything', () => {
  const m = usgsToIso2Map([
    { placeName: 'Japan', energy: Math.pow(10, 1.5 * 7.0) },   // one M7
    { placeName: 'Chile', energy: Math.pow(10, 1.5 * 4.5) },   // one M4.5
  ]);
  const ratio = m.get('JP') / m.get('CL');
  assert.ok(ratio < 2, `log scale keeps the ratio small, got ${ratio}`);
});
