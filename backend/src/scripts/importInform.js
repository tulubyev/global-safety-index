require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchInformRisk }  = require('../parsers/informParser');
const { getDb }            = require('../services/dbService');

async function main() {
  console.log('Starting INFORM Risk Index import...');
  const informData = await fetchInformRisk();

  const db = getDb();

  // Map ISO3 → ISO2 using countries table
  const { rows: countries } = await db.query(
    'SELECT code, code3 FROM countries WHERE code3 IS NOT NULL'
  );
  const iso3to2 = {};
  for (const c of countries) iso3to2[c.code3] = c.code;

  const matched = informData
    .map(e => ({ ...e, code: iso3to2[e.iso3] }))
    .filter(e => e.code);

  console.log(`Matched ${matched.length} / ${informData.length} countries`);

  // INFORM scores are 0-10; scale to 0-100 for consistency with our DB
  const scale = v => Math.round(v * 10 * 100) / 100;

  const measuredAt = '2026-01-01';  // INFORM Risk 2026 release date
  let updated = 0;

  for (const entry of matched) {
    // disaster = natural hazard sub-score (earthquake + flood + tsunami + cyclone + drought + epidemic)
    // This replaces the outdated World Bank 1990-2009 data
    const disaster = scale(entry.natural);

    // Carry forward best conflict & food values
    const { rows } = await db.query(
      `SELECT conflict, food FROM risks WHERE country_code = $1 ORDER BY measured_at DESC LIMIT 1`,
      [entry.code]
    );
    if (!rows.length) continue;
    const { conflict, food } = rows[0];

    await db.query(
      `INSERT INTO risks (country_code, measured_at, conflict, disaster, food, source)
       VALUES ($1, $2, $3, $4, $5, 'inform')
       ON CONFLICT (country_code, measured_at) DO UPDATE SET
         disaster = EXCLUDED.disaster,
         source   = EXCLUDED.source`,
      [entry.code, measuredAt, conflict, disaster, food]
    );
    updated++;
  }

  console.log(`Done: ${updated} countries updated with INFORM disaster data`);

  // Preview top/bottom
  const { rows: top } = await db.query(`
    SELECT c.name, ri.disaster
    FROM risks ri JOIN countries c ON c.code=ri.country_code
    WHERE ri.source='inform' ORDER BY ri.disaster DESC LIMIT 10
  `);
  console.log('\nTop 10 disaster risk (INFORM Natural):');
  console.table(top);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
