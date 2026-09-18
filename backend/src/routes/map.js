const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');
const cacheService = require('../services/cacheService');
const { compositeScore } = require('../services/scoreService');

const DIM_SELECT = `
  COALESCE(r.conflict, 0)::float AS conflict,
  COALESCE(r.disaster, 0)::float AS disaster,
  COALESCE(r.food,     0)::float AS food,
  COALESCE(r.seismic,  0)::float AS seismic,
  COALESCE(r.pandemic, 0)::float AS pandemic,
  (r.code IS NOT NULL)           AS has_data`;

function toProperties(row) {
  const dims = {
    conflict: row.conflict, disaster: row.disaster, food: row.food,
    seismic:  row.seismic,  pandemic: row.pandemic,
  };
  return {
    code:     row.code,
    name:     row.name,
    has_data: row.has_data,
    // Absolute 0–100 with default weights — identical formula to /api/custom-weights.
    // The client re-scores with user weights using the same formula.
    score:    row.has_data ? compositeScore(dims).toFixed(1) : null,
    conflict: dims.conflict.toFixed(1),
    disaster: dims.disaster.toFixed(1),
    food:     dims.food.toFixed(1),
    seismic:  dims.seismic.toFixed(1),
    pandemic: dims.pandemic.toFixed(1),
  };
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
