require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');
const { minMaxNormalize } = require('../parsers/normalizer');
const { getDb } = require('../services/dbService');

// EN.CLC.MDAT.ZS — People affected by natural disasters (% of population, avg 1990-2009)
// VC.IHR.PSRC.P5 — Intentional homicides (proxy for baseline instability)
// We use disaster-affected population as disaster risk proxy
const INDICATOR = 'EN.CLC.MDAT.ZS';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchDisasterData() {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${INDICATOR}?format=json&mrv=1&per_page=300`;
  const json = await fetchJson(url);
  if (!Array.isArray(json) || json.length < 2) throw new Error('Unexpected World Bank response');

  const results = [];
  for (const entry of json[1]) {
    if (!entry.value || !entry.countryiso3code) continue;
    results.push({ code3: entry.countryiso3code, value: entry.value, year: entry.date });
  }
  return results;
}

async function main() {
  console.log('Fetching World Bank disaster risk data...');
  const disasterData = await fetchDisasterData();
  console.log(`Got ${disasterData.length} entries`);

  const db = getDb();
  const { rows: countries } = await db.query('SELECT code, code3 FROM countries WHERE code3 IS NOT NULL');
  const iso3to2 = {};
  for (const c of countries) iso3to2[c.code3] = c.code;

  const entries = [];
  for (const item of disasterData) {
    const code2 = iso3to2[item.code3];
    if (!code2) continue;
    entries.push({ code: code2, rawDisaster: item.value, year: item.year });
  }

  const normalized = minMaxNormalize(entries.map((e) => e.rawDisaster));
  entries.forEach((e, i) => { e.disaster = normalized[i]; });

  console.log(`Importing ${entries.length} countries...`);
  let updated = 0;

  for (const entry of entries) {
    const { rows } = await db.query(
      `SELECT conflict, food FROM risks WHERE country_code = $1 ORDER BY measured_at DESC LIMIT 1`,
      [entry.code]
    );
    if (!rows.length) continue;

    const { conflict, food } = rows[0];
    await db.query(
      `INSERT INTO risks (country_code, measured_at, conflict, disaster, food, source)
       VALUES ($1, $2, $3, $4, $5, 'worldbank_disaster')
       ON CONFLICT (country_code, measured_at) DO UPDATE SET
         disaster = EXCLUDED.disaster,
         source   = EXCLUDED.source`,
      [entry.code, `${entry.year}-01-01`, conflict, entry.disaster.toFixed(2), food]
    );
    updated++;
  }

  console.log(`Done: ${updated} countries updated with disaster risk data`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
