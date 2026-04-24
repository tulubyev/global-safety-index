require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchGdeltConflict } = require('../parsers/gdeltParser');
const { minMaxNormalize } = require('../parsers/normalizer');
const { getDb } = require('../services/dbService');

async function main() {
  console.log('Starting GDELT conflict data import...');
  const gdeltEntries = await fetchGdeltConflict();
  console.log(`Got GDELT raw scores for ${gdeltEntries.length} countries`);

  if (!gdeltEntries.length) {
    console.log('No data received — aborting');
    process.exit(1);
  }

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Get ALL countries from DB
  const { rows: allCountries } = await db.query('SELECT code FROM countries');
  const allCodes = new Set(allCountries.map((c) => c.code));

  // Build a map of gdelt scores by country code
  const gdeltMap = {};
  for (const e of gdeltEntries) {
    if (allCodes.has(e.code)) gdeltMap[e.code] = e.rawScore;
  }

  console.log(`GDELT matched ${Object.keys(gdeltMap).length} countries in our DB`);

  // Normalize globally: all countries get 0 unless in GDELT
  const allScores = allCountries.map((c) => gdeltMap[c.code] ?? 0);
  const normalized = minMaxNormalize(allScores);

  const codeToScore = {};
  allCountries.forEach((c, i) => { codeToScore[c.code] = normalized[i]; });

  // Only insert/update countries that have meaningful GDELT data (score > 0)
  const toUpdate = allCountries.filter((c) => gdeltMap[c.code] !== undefined);
  console.log(`Updating ${toUpdate.length} countries with GDELT conflict data...`);

  let updated = 0;
  for (const { code } of toUpdate) {
    const conflictScore = codeToScore[code];

    // Get latest disaster/food values to carry forward
    const { rows } = await db.query(
      `SELECT disaster, food FROM risks WHERE country_code = $1 ORDER BY measured_at DESC LIMIT 1`,
      [code]
    );
    if (!rows.length) continue;
    const { disaster, food } = rows[0];

    await db.query(
      `INSERT INTO risks (country_code, measured_at, conflict, disaster, food, source)
       VALUES ($1, $2, $3, $4, $5, 'gdelt')
       ON CONFLICT (country_code, measured_at) DO UPDATE SET
         conflict = EXCLUDED.conflict,
         source   = EXCLUDED.source`,
      [code, today, conflictScore.toFixed(2), disaster, food]
    );
    updated++;
  }

  console.log(`Done: ${updated} countries updated with GDELT conflict data (globally normalized)`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
