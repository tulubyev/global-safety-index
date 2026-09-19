require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchUcdpConflict } = require('../parsers/ucdpParser');
const { minMaxNormalize } = require('../parsers/normalizer');
const { getDb } = require('../services/dbService');

async function main() {
  console.log('Starting UCDP conflict data import...');
  const db = getDb();
  const { rows: countries } = await db.query('SELECT code, name FROM countries');
  const nameToCode = new Map(countries.map(c => [c.name.toLowerCase(), c.code]));
  const resolveName = (n) => nameToCode.get(String(n || '').toLowerCase().trim()) || null;

  const ucdpMap = await fetchUcdpConflict(resolveName);
  console.log(`Got data for ${ucdpMap.size} countries`);
  if (!ucdpMap.size) { console.log('No data — aborting'); process.exit(1); }

  const codes = [...ucdpMap.keys()];
  const normalized = minMaxNormalize(codes.map(c => ucdpMap.get(c)));

  let updated = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const conflictScore = normalized[i];

    // Get latest disaster/food values
    const { rows } = await db.query(
      `SELECT disaster, food FROM risks WHERE country_code = $1 ORDER BY measured_at DESC LIMIT 1`,
      [code]
    );
    if (!rows.length) continue;
    const { disaster, food } = rows[0];

    await db.query(
      `INSERT INTO risks (country_code, measured_at, conflict, disaster, food, source)
       VALUES ($1, $2, $3, $4, $5, 'ucdp')
       ON CONFLICT (country_code, measured_at) DO UPDATE SET
         conflict = EXCLUDED.conflict,
         source   = EXCLUDED.source`,
      [code, today, conflictScore.toFixed(2), disaster, food]
    );
    updated++;
  }

  console.log(`Done: ${updated} countries updated with UCDP historical conflict data`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
