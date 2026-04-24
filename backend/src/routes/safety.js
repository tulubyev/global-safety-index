const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');
const cacheService = require('../services/cacheService');

// GET /api/safety?lat=&lon=&radius=500
router.get('/', async (req, res) => {
  const { lat, lon, radius = 500 } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' });

  const cacheKey = `safety:${lat}:${lon}:${radius}`;
  const cached = await cacheService.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    const radiusMeters = Number(radius) * 1000;
    const { rows } = await db.query(
      `SELECT c.name, c.code, c.name_ru, r.conflict, r.disaster, r.food, r.score, r.measured_at
       FROM countries c
       JOIN LATERAL (
         SELECT conflict, disaster, food, score, measured_at
         FROM risks
         WHERE country_code = c.code
         ORDER BY measured_at DESC
         LIMIT 1
       ) r ON true
       WHERE ST_Contains(c.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       LIMIT 1`,
      [lon, lat]
    );

    if (!rows.length) return res.status(404).json({ error: 'No country found at this location' });

    const result = {
      country: rows[0].name,
      code: rows[0].code,
      score: rows[0].score,
      conflict: rows[0].conflict,
      disaster: rows[0].disaster,
      food: rows[0].food,
      weights: [0.35, 0.35, 0.30],
      measured_at: rows[0].measured_at,
    };

    await cacheService.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
