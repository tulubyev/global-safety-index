require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchFoodData } = require('../parsers/worldBankParser');
const { minMaxNormalize } = require('../parsers/normalizer');
const { getDb } = require('../services/dbService');

async function main() {
  console.log('Fetching World Bank food security data...');
  const foodData = await fetchFoodData();
  console.log(`Got ${foodData.length} entries from World Bank`);

  const db = getDb();

  // Map ISO3 → ISO2 using our countries table
  const { rows: countries } = await db.query('SELECT code, code3 FROM countries WHERE code3 IS NOT NULL');
  const iso3to2 = {};
  for (const c of countries) iso3to2[c.code3] = c.code;

  // Build list with raw food values
  const entries = [];
  for (const item of foodData) {
    const code2 = iso3to2[item.code3];
    if (!code2) continue;
    entries.push({ code: code2, rawFood: item.value, year: item.year });
  }

  // Normalize food values min-max to [0, 100]
  const rawValues = entries.map((e) => e.rawFood);
  const normalized = minMaxNormalize(rawValues);
  entries.forEach((e, i) => { e.food = normalized[i]; });

  console.log(`Importing ${entries.length} countries...`);
  let updated = 0;

  for (const entry of entries) {
    // Update existing mock row's food value, keep conflict/disaster from mock
    const { rows } = await db.query(
      `SELECT conflict, disaster FROM risks WHERE country_code = $1 ORDER BY measured_at DESC LIMIT 1`,
      [entry.code]
    );
    if (!rows.length) continue;

    const { conflict, disaster } = rows[0];
    await db.query(
      `INSERT INTO risks (country_code, measured_at, conflict, disaster, food, source)
       VALUES ($1, $2, $3, $4, $5, 'worldbank')
       ON CONFLICT (country_code, measured_at) DO UPDATE SET
         food   = EXCLUDED.food,
         source = EXCLUDED.source`,
      [entry.code, `${entry.year}-01-01`, conflict, disaster, entry.food.toFixed(2)]
    );
    updated++;
  }

  console.log(`Done: ${updated} countries updated with real food security data`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
