const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');
const cacheService = require('../services/cacheService');
const { compositeScore, coverage, DEFAULT_WEIGHTS, DIMENSIONS } = require('../services/scoreService');

// GET /api/safety?lat=&lon=
router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' });

  const cacheKey = `safety:v2:${lat}:${lon}`;
  const cached = await cacheService.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT c.name, c.code, c.name_ru,
              ${DIMENSIONS.map(d => `r.${d}::float AS ${d}`).join(', ')}, r.measured_at
       FROM countries c
       JOIN latest_risks r USING(code)
       WHERE ST_Contains(c.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       LIMIT 1`,
      [lon, lat]
    );

    if (!rows.length) return res.status(404).json({ error: 'No country found at this location' });
    const row = rows[0];

    const result = {
      country:  row.name,
      code:     row.code,
      score:      compositeScore(row).toFixed(1),
      coverage:   coverage(row),
      dimensions: DIMENSIONS.length,
      ...Object.fromEntries(DIMENSIONS.map(d => [d, row[d]])),
      weights:    DEFAULT_WEIGHTS,
      measured_at: row.measured_at,
    };

    await cacheService.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
