const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');
const cacheService = require('../services/cacheService');
const { compositeScore, coverage, hasValue, DIMENSIONS } = require('../services/scoreService');

// NULL is preserved rather than coalesced to 0: "no data" must not read as
// "measured zero", which would make an unmeasured country look safe.
const DIM_SELECT = DIMENSIONS.map(d => `  r.${d}::float AS ${d}`).join(',\n')
                 + ',\n  (r.code IS NOT NULL) AS has_data';

function toProperties(row) {
  const dims = Object.fromEntries(DIMENSIONS.map(d => [d, row[d]]));
  const n    = coverage(dims);

  const props = {
    code:      row.code,
    name:      row.name,
    has_data:  row.has_data && n > 0,
    coverage:  n,
    dimensions: DIMENSIONS.length,
    // Absolute 0–100 with default weights — identical formula to
    // /api/custom-weights. The client re-scores with user weights.
    score:     n > 0 ? compositeScore(dims).toFixed(1) : null,
  };
  for (const d of DIMENSIONS) {
    props[d] = hasValue(dims[d]) ? Number(dims[d]).toFixed(1) : null;
  }
  return props;
}

// GET /api/map/all — FeatureCollection for choropleth
router.get('/all', async (req, res) => {
  const cacheKey = 'map:all:v3';
  const cached = await cacheService.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT c.code, c.name,
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(c.geom, 0.05)) AS geom,
              ${DIM_SELECT}
       FROM countries c
       LEFT JOIN latest_risks r USING(code)
       WHERE c.geom IS NOT NULL
         AND c.code != ALL(ARRAY['HK'])`
    );

    const result = {
      type: 'FeatureCollection',
      features: rows.map((row) => ({
        type: 'Feature',
        geometry: JSON.parse(row.geom),
        properties: toProperties(row),
      })),
    };

    await cacheService.set(cacheKey, result, 3600); // 1h TTL
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/map?country=IS
router.get('/', async (req, res) => {
  const { country } = req.query;
  if (!country) return res.status(400).json({ error: 'country is required' });

  const cacheKey = `map:${country.toUpperCase()}:v3`;
  const cached = await cacheService.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT c.code, c.name, ST_AsGeoJSON(c.geom) AS geom,
              ${DIM_SELECT}
       FROM countries c
       LEFT JOIN latest_risks r USING(code)
       WHERE c.code = $1`,
      [country.toUpperCase()]
    );

    if (!rows.length) return res.status(404).json({ error: 'Country not found' });
    const row = rows[0];

    const result = {
      type: 'Feature',
      geometry: JSON.parse(row.geom),
      properties: toProperties(row),
    };

    await cacheService.set(cacheKey, result, 3600);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
