const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');
const cacheService = require('../services/cacheService');

// GET /api/top10?n=10
router.get('/', async (req, res) => {
  const n = Math.min(Number(req.query.n) || 10, 50);
  const cacheKey = `top10:${n}`;
  const cached = await cacheService.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT c.code, c.name, c.name_ru, r.conflict, r.disaster, r.food, r.score, r.measured_at
       FROM latest_risks r
       JOIN countries c USING(code)
       ORDER BY r.score ASC
       LIMIT $1`,
      [n]
    );

    const result = {
      data: rows.map((row, i) => ({ rank: i + 1, country: row.name, code: row.code, score: row.score, conflict: row.conflict, disaster: row.disaster, food: row.food })),
      weights: [0.35, 0.35, 0.30],
      updated_at: new Date().toISOString(),
    };

    await cacheService.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
