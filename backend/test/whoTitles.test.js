'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildResolver, extractCountriesFromTitle } = require('../src/parsers/whoParser');

// Stand-in for the `countries` table the cron passes in
const DB = new Map(Object.entries({
  'democratic republic of the congo': 'CD', 'congo': 'CG', 'uganda': 'UG',
  'ethiopia': 'ET', 'israel': 'IL', 'mexico': 'MX', 'india': 'IN',
  'cambodia': 'KH', 'viet nam': 'VN', 'saudi arabia': 'SA', 'bolivia': 'BO',
  'barbados': 'BB', 'mauritania': 'MR', 'senegal': 'SN', 'united states': 'US',
  'united states of america': 'US', 'nigeria': 'NG', 'niger': 'NE',
  'haiti': 'HT', 'kenya': 'KE', 'guinea': 'GN', 'papua new guinea': 'PG',
  'iraq': 'IQ', 'rwanda': 'RW', 'tanzania': 'TZ', 'sudan': 'SD', 'south sudan': 'SS',
}));

const matcher = buildResolver(DB);
const find = t => extractCountriesFromTitle(t, matcher).sort();

test('separator style does not matter', () => {
  // Every one of these punctuation styles appears in the live WHO feed
  assert.deepStrictEqual(find('Marburg virus disease- Ethiopia'), ['ET']);
  assert.deepStrictEqual(find('Avian Influenza A(H5N1)- Cambodia'), ['KH']);
  assert.deepStrictEqual(find('Human infection caused by avian Influenza A(H5N2)-Mexico'), ['MX']);
  assert.deepStrictEqual(find('Middle East respiratory syndrome coronavirus-Kingdom of Saudi Arabia'), ['SA']);
  assert.deepStrictEqual(find('Mpox – Democratic Republic of the Congo'), ['CD']);
});

test('a hyphen inside the disease name does not eat the location', () => {
  assert.deepStrictEqual(find('Circulating vaccine-derived poliovirus type 1- Israel'), ['IL']);
});

test('several countries in one title are all found', () => {
  assert.deepStrictEqual(
    find('Ebola disease caused by Bundibugyo virus, Democratic Republic of the Congo & Uganda'),
    ['CD', 'UG']);
  assert.deepStrictEqual(find('Cholera – Haiti, Kenya, Nigeria'), ['HT', 'KE', 'NG']);
  assert.deepStrictEqual(find('Rift Valley fever- Mauritania and Senegal'), ['MR', 'SN']);
});

test('a disease name containing a country does not resolve to it', () => {
  // "Crimean-Congo" must not produce Congo
  assert.deepStrictEqual(find('Crimean-Congo haemorrhagic fever - Iraq'), ['IQ']);
  assert.deepStrictEqual(find('Middle East respiratory syndrome coronavirus - Global update'), []);
});

test('a longer country name blocks the shorter one inside it', () => {
  assert.deepStrictEqual(find('Cholera – Niger'), ['NE']);
  assert.deepStrictEqual(find('Polio – Papua New Guinea'), ['PG']);
  assert.deepStrictEqual(find('Avian Influenza A(H5N5)- United States of America'), ['US']);
});

test('global and regional titles name no country', () => {
  for (const t of [
    'Yellow fever - Global',
    'Dengue - Global situation',
    'COVID-19 - Global Situation',
    'Mpox – African Region',
    'Diphtheria - African Region (AFRO)',
    'Measles – Region of the Americas',
    'Cholera – Multi-country with a focus on countries experiencing current surges',
    'Hantavirus outbreak linked to cruise ship travel, Multi-locations',
    'Trends of acute respiratory infection, including human metapneumovirus, in the Northern Hemisphere',
  ]) {
    assert.deepStrictEqual(find(t), [], `expected no country in: ${t}`);
    assert.ok(matcher.isGlobalScope(t), `expected global scope for: ${t}`);
  }
});

test('titles with no location at all are distinguishable from global ones', () => {
  for (const t of ['Rabies', 'Avian Influenza A(H9N2)']) {
    assert.deepStrictEqual(find(t), []);
    assert.strictEqual(matcher.isGlobalScope(t), false);
  }
});

test('long-form official country names resolve', () => {
  assert.deepStrictEqual(find('Chapare haemorrhagic fever- the Plurinational State of Bolivia'), ['BO']);
  assert.deepStrictEqual(find('Marburg virus disease - the United Republic of Tanzania'), ['TZ']);
  assert.deepStrictEqual(find('Cluster of community deaths in Basankusu, Equateur- Democratic Republic of the Congo'), ['CD']);
});
