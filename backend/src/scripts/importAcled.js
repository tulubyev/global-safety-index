'use strict';
/**
 * Import ACLED conflict data into the risks table.
 *
 * Usage:
 *   node src/scripts/importAcled.js
 *
 * Requires in .env:
 *   ACLED_EMAIL=your@email.com
 *   ACLED_PASSWORD=yourpassword
 */

require('dotenv').config();
const { Pool }             = require('pg');
const { fetchAcledConflict } = require('../parsers/acledParser');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('[importAcled] Starting…');

  // 1. Fetch weighted fatalities per ISO2 from ACLED
  const totals = await fetchAcledConflict(2020);

  if (!totals.size) {
    console.error('[importAcled] No data returned. Check ACLED_EMAIL / ACLED_PASSWORD in .env');
    process.exit(1);
  }

  // 2. Log-normalise across all countries → 0-100
  const entries = [...totals.entries()];
  const rawVals = entries.map(([, v]) => Math.log1p(v));
  const minV    = Math.min(...rawVals);
  const maxV    = Math.max(...rawVals);
  const range   = maxV - minV || 1;

  console.log(`[importAcled] Normalising ${entries.length} countries. Raw range: ${minV.toFixed(2)}–${maxV.toFixed(2)}`);

  // 3. Upsert into risks table
  const measured_at = new Date().toISOString().slice(0, 10); // today
  let inserted = 0;

  for (const [iso2, raw] of entries) {
    const score = ((Math.log1p(raw) - minV) / range) * 100;

    await pool.query(
      `INSERT INTO risks (country_code, source, conflict, disaster, food, seismic, measured_at)
       VALUES ($1, 'acled', $2, 0, 0, 0, $3)
       ON CONFLICT DO NOTHING`,
      [iso2, score.toFixed(2), measured_at]
    );
    inserted++;
  }

  console.log(`[importAcled] Inserted ${inserted} rows. Done.`);

  // 4. Remind user to update the VIEW
  console.log('[importAcled] Remember to update latest_risks VIEW to include acled source (run updateView).');
  await updateView();
}

async function updateView() {
  console.log('[importAcled] Updating latest_risks VIEW to include acled source…');
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
      COALESCE(inf.inform_disaster, wd.wb_disaster, mock.mock_disaster, 25)::numeric(5,2) AS disaster,
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
    LEFT JOIN wb_disaster_data wd   ON wd.country_code   = c.code
    LEFT JOIN food_data        f    ON f.country_code    = c.code
    LEFT JOIN seismic_data     s    ON s.country_code    = c.code
    LEFT JOIN mock_data        mock ON mock.country_code = c.code
  `);
  console.log('[importAcled] VIEW updated. Done.');
  await pool.end();
}

run().catch(err => {
  console.error(err);
  pool.end();
  process.exit(1);
});
