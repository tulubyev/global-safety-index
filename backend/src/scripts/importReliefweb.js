'use strict';
/**
 * Import ReliefWeb disaster data into the risks table.
 *
 * Usage:
 *   node src/scripts/importReliefweb.js
 *
 * Requires in .env:
 *   DATABASE_URL=postgres://...
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool }                    = require('pg');
const { fetchReliefwebDisasters } = require('../parsers/reliefwebParser');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('[importReliefweb] Starting…');

  // 1. Fetch weighted + time-decayed scores per ISO2 country
  const scores = await fetchReliefwebDisasters();

  if (!scores.size) {
    console.error('[importReliefweb] No data returned from ReliefWeb API.');
    process.exit(1);
  }

  // 2. Log-normalise: log1p(score), then min-max scale to 0-100
  const entries = [...scores.entries()];
  const logVals = entries.map(([, v]) => Math.log1p(v));
  const minV    = Math.min(...logVals);
  const maxV    = Math.max(...logVals);
  const range   = maxV - minV || 1;

  console.log(
    `[importReliefweb] Normalising ${entries.length} countries. ` +
    `log-score range: ${minV.toFixed(3)}–${maxV.toFixed(3)}`
  );

  // 3. Upsert into risks table
  const measured_at = new Date().toISOString().slice(0, 10);   // today YYYY-MM-DD
  let inserted = 0;

  for (const [iso2, raw] of entries) {
    const logScore   = Math.log1p(raw);
    const normalized = ((logScore - minV) / range) * 100;

    await pool.query(
      `INSERT INTO risks (country_code, source, conflict, disaster, food, seismic, measured_at)
       VALUES ($1, 'reliefweb', 0, $2, 0, 0, $3)
       ON CONFLICT DO NOTHING`,
      [iso2, normalized.toFixed(2), measured_at]
    );
    inserted++;
  }

  console.log(`[importReliefweb] Inserted ${inserted} rows for date ${measured_at}.`);

  // 4. Recreate latest_risks VIEW with reliefweb as a disaster source
  await updateView();

  console.log(`[importReliefweb] Done. ${inserted} countries updated.`);
}

async function updateView() {
  console.log('[importReliefweb] Recreating latest_risks VIEW…');

  await pool.query(`
    CREATE OR REPLACE VIEW latest_risks AS
    WITH ucdp_data AS (
      SELECT DISTINCT ON (country_code) country_code, conflict AS ucdp_conflict
      FROM risks WHERE source = 'ucdp'
      ORDER BY country_code, measured_at DESC
    ), gtd_data AS (
      SELECT DISTINCT ON (country_code) country_code, conflict AS gtd_conflict
      FROM risks WHERE source = 'gtd'
      ORDER BY country_code, measured_at DESC
    ), acled_data AS (
      SELECT DISTINCT ON (country_code) country_code, conflict AS acled_conflict
      FROM risks WHERE source = 'acled'
      ORDER BY country_code, measured_at DESC
    ), manual_data AS (
      SELECT DISTINCT ON (country_code) country_code, conflict AS manual_conflict
      FROM risks WHERE source = 'manual'
      ORDER BY country_code, measured_at DESC
    ), inform_data AS (
      SELECT DISTINCT ON (country_code) country_code, disaster AS inform_disaster
      FROM risks WHERE source = 'inform'
      ORDER BY country_code, measured_at DESC
    ), reliefweb_data AS (
      SELECT DISTINCT ON (country_code) country_code, disaster AS reliefweb_disaster
      FROM risks WHERE source = 'reliefweb'
      ORDER BY country_code, measured_at DESC
    ), wb_disaster_data AS (
      SELECT DISTINCT ON (country_code) country_code, disaster AS wb_disaster
      FROM risks WHERE source = 'worldbank_disaster'
      ORDER BY country_code, measured_at DESC
    ), food_data AS (
      SELECT DISTINCT ON (country_code) country_code, food
      FROM risks WHERE source = 'worldbank'
      ORDER BY country_code, measured_at DESC
    ), seismic_data AS (
      SELECT DISTINCT ON (country_code) country_code, seismic
      FROM risks WHERE source = 'usgs'
      ORDER BY country_code, measured_at DESC
    ), mock_data AS (
      SELECT DISTINCT ON (country_code) country_code,
        disaster AS mock_disaster, food AS mock_food
      FROM risks WHERE source = 'mock'
      ORDER BY country_code, measured_at DESC
    )
    SELECT
      c.code, c.name, c.name_ru, c.region, c.geom,
      GREATEST(
        COALESCE(u.ucdp_conflict,   0),
        COALESCE(g.gtd_conflict,    0),
        COALESCE(a.acled_conflict,  0),
        COALESCE(m.manual_conflict, 0)
      )::numeric(5,2) AS conflict,
      COALESCE(inf.inform_disaster, rw.reliefweb_disaster, wd.wb_disaster, mock.mock_disaster, 25)::numeric(5,2) AS disaster,
      COALESCE(f.food, mock.mock_food, 25)::numeric(5,2) AS food,
      COALESCE(s.seismic, 0)::numeric(5,2) AS seismic,
      NULL::numeric(5,2) AS score,
      now() AS measured_at
    FROM countries c
    LEFT JOIN ucdp_data        u    ON u.country_code    = c.code
    LEFT JOIN gtd_data         g    ON g.country_code    = c.code
    LEFT JOIN acled_data       a    ON a.country_code    = c.code
    LEFT JOIN manual_data      m    ON m.country_code    = c.code
    LEFT JOIN inform_data      inf  ON inf.country_code  = c.code
    LEFT JOIN reliefweb_data   rw   ON rw.country_code   = c.code
    LEFT JOIN wb_disaster_data wd   ON wd.country_code   = c.code
    LEFT JOIN food_data        f    ON f.country_code    = c.code
    LEFT JOIN seismic_data     s    ON s.country_code    = c.code
    LEFT JOIN mock_data        mock ON mock.country_code = c.code
  `);

  console.log('[importReliefweb] VIEW recreated successfully.');
  await pool.end();
}

run().catch((err) => {
  console.error('[importReliefweb] Fatal error:', err);
  pool.end();
  process.exit(1);
});
