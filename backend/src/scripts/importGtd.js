require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchGtdTerrorism } = require('../parsers/gtdParser');
const { minMaxNormalize } = require('../parsers/normalizer');
const { getDb } = require('../services/dbService');

async function main() {
  console.log('Starting GTD terrorism data import...');
  const rawData = await fetchGtdTerrorism({ fromYear: 2010, toYear: 2021, halfLife: 5 });

  const db = getDb();

  // Map ISO3 → ISO2 using countries table
  const { rows: countries } = await db.query(
    'SELECT code, code3 FROM countries WHERE code3 IS NOT NULL'
  );
  const iso3to2 = {};
  for (const c of countries) iso3to2[c.code3] = c.code;

  // Filter to countries we have in DB
  const matched = rawData
    .map((e) => ({ code: iso3to2[e.iso3], weightedDeaths: e.weightedDeaths }))
    .filter((e) => e.code);

  console.log(`Matched ${matched.length} countries to DB`);

  if (!matched.length) { console.log('No matches — aborting'); process.exit(1); }

  // Log-scale to compress the Afghanistan/Iraq spike, then min-max normalize to 0-100
  const logScores  = matched.map((e) => Math.log1p(e.weightedDeaths));
  const normalized = minMaxNormalize(logScores);

  // Preview top 15
  const preview = matched
    .map((e, i) => ({ code: e.code, raw: Math.round(e.weightedDeaths), score: normalized[i].toFixed(1) }))
    .sort((a, b) => b.raw - a.raw)
    .slice(0, 15);
  console.log('Top 15 by terrorism deaths:');
  console.table(preview);

  // Insert into risks table (source='gtd', date=2021-12-31 = last year of data)
  let updated = 0;
  const measuredAt = '2021-12-31';

  for (let i = 0; i < matched.length; i++) {
    const { code } = matched[i];
    const conflictScore = normalized[i];

    // Carry forward best available disaster/food
    const { rows } = await db.query(
      `SELECT disaster, food FROM risks WHERE country_code = $1 ORDER BY measured_at DESC LIMIT 1`,
      [code]
    );
    if (!rows.length) continue;
    const { disaster, food } = rows[0];

    await db.query(
      `INSERT INTO risks (country_code, measured_at, conflict, disaster, food, source)
       VALUES ($1, $2, $3, $4, $5, 'gtd')
       ON CONFLICT (country_code, measured_at) DO UPDATE SET
         conflict = EXCLUDED.conflict,
         source   = EXCLUDED.source`,
      [code, measuredAt, conflictScore.toFixed(2), disaster, food]
    );
    updated++;
  }

  console.log(`Done: ${updated} countries updated with GTD terrorism data`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
