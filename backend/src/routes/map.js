const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');
const cacheService = require('../services/cacheService');

// Default weights used for map coloring (equal across 4 dimensions)
const W = [0.25, 0.25, 0.25, 0.25];

// GET /api/map/all — FeatureCollection for choropleth
router.get('/all', async (req, res) => {
  const cacheKey = 'map:all:v2';
  const cached = await cacheService.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT c.code, c.name,
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(c.geom, 0.05)) AS geom,
              r.conflict::float AS conflict,
              r.disaster::float AS disaster,
              r.food::float     AS food,
              r.seismic::float  AS seismic
       FROM countries c
       LEFT JOIN latest_risks r USING(code)
       WHERE c.geom IS NOT NULL
         AND c.code != ALL(ARRAY['HK'])`
    );

    // Compute raw weighted score for each country
    const withScore = rows.map((r) => ({
      ...r,
      raw: (r.conflict || 0) * W[0] + (r.disaster || 0) * W[1]
         + (r.food    || 0) * W[2] + (r.seismic  || 0) * W[3],
    }));

    // Global min-max normalize to 0–100
    const vals  = withScore.map((r) => r.raw);
    const minV  = Math.min(...vals);
    const maxV  = Math.max(...vals);
    const range = maxV - minV || 1;

    const result = {
      type: 'FeatureCollection',
      features: withScore.map((row) => ({
        type: 'Feature',
        geometry: JSON.parse(row.geom),
        properties: {
          code:     row.code,
          name:     row.name,
          score:    (Math.sqrt((row.raw - minV) / range) * 100).toFixed(1),
          conflict: row.conflict?.toFixed(1) ?? '0.0',
          disaster: row.disaster?.toFixed(1) ?? '0.0',
          food:     row.food?.toFixed(1)     ?? '0.0',
          seismic:  row.seismic?.toFixed(1)  ?? '0.0',
        },
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

  const cacheKey = `map:${country.toUpperCase()}:v2`;
  const cached = await cacheService.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT c.code, c.name, ST_AsGeoJSON(c.geom) AS geom,
              r.conflict::float AS conflict,
              r.disaster::float AS disaster,
              r.food::float     AS food
       FROM countries c
       LEFT JOIN latest_risks r USING(code)
       WHERE c.code = $1`,
      [country.toUpperCase()]
    );

    if (!rows.length) return res.status(404).json({ error: 'Country not found' });
    const row = rows[0];
    const raw = (row.conflict || 0) * W[0] + (row.disaster || 0) * W[1] + (row.food || 0) * W[2];

    const result = {
      type: 'Feature',
      geometry: JSON.parse(row.geom),
      properties: {
        code:     row.code,
        name:     row.name,
        score:    raw.toFixed(1),   // raw (not globally normalized for single-country)
        conflict: row.conflict?.toFixed(1) ?? '0.0',
        disaster: row.disaster?.toFixed(1) ?? '0.0',
        food:     row.food?.toFixed(1)     ?? '0.0',
      },
    };

    await cacheService.set(cacheKey, result, 3600);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
