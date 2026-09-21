const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');
const cacheService = require('../services/cacheService');
const { compositeScore, coverage, DEFAULT_WEIGHTS, DIMENSIONS } = require('../services/scoreService');

// GET /api/top10?n=10
router.get('/', async (req, res) => {
  const n = Math.min(Number(req.query.n) || 10, 50);
  const cacheKey = `top10:${n}`;
  const cached = await cacheService.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    // Score recomputed here (not read from r.score) so old rows written with a
    // previous formula rank consistently with the rest of the API.
    const { rows } = await db.query(
      `SELECT c.code, c.name, c.name_ru,
              ${DIMENSIONS.map(d => `r.${d}::float AS ${d}`).join(', ')},
              r.measured_at
       FROM latest_risks r
       JOIN countries c USING(code)`
    );

    const scored = rows
      .filter(row => coverage(row) >= 3)
      .map(row => ({ ...row, score: compositeScore(row), cov: coverage(row) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, n);

    const result = {
      data: scored.map((row, i) => ({
        rank:     i + 1,
        country:  row.name,
        code:     row.code,
        score:      row.score.toFixed(1),
        coverage:   row.cov,
        dimensions: DIMENSIONS.length,
        ...Object.fromEntries(DIMENSIONS.map(d => [d, row[d]])),
      })),
      weights: DEFAULT_WEIGHTS,
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
