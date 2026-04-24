const express = require('express');
const router  = express.Router();
const { getDb } = require('../services/dbService');

// POST /api/custom-weights
// Body: { weights: { conflict, disaster, food, seismic }, top_n }
// All weights are non-negative; server normalises to sum = 1
router.post('/', async (req, res) => {
  const { weights, top_n = 10 } = req.body;

  // Accept both object form { conflict, disaster, food, seismic }
  // and legacy array form [w1, w2, w3] for backwards compatibility
  let wConflict, wDisaster, wFood, wSeismic;

  if (Array.isArray(weights)) {
    [wConflict = 0, wDisaster = 0, wFood = 0, wSeismic = 0] = weights;
  } else if (weights && typeof weights === 'object') {
    wConflict = Number(weights.conflict) || 0;
    wDisaster = Number(weights.disaster) || 0;
    wFood     = Number(weights.food)     || 0;
    wSeismic  = Number(weights.seismic)  || 0;
  } else {
    return res.status(400).json({ error: 'weights must be an object or array' });
  }

  const sum = wConflict + wDisaster + wFood + wSeismic;
  if (sum === 0) return res.status(400).json({ error: 'all weights are zero' });

  // Normalise
  const n1 = wConflict / sum;
  const n2 = wDisaster / sum;
  const n3 = wFood     / sum;
  const n4 = wSeismic  / sum;

  const n = Math.min(Number(top_n), 300);

  try {
    const db = getDb();

    // HK excluded: not tracked separately in international indices since 2020
    const EXCLUDE = ['HK'];

    const { rows: all } = await db.query(
      `SELECT c.code, c.name,
              ($1 * r.conflict::float
             + $2 * r.disaster::float
             + $3 * r.food::float
             + $4 * r.seismic::float) AS raw_score,
              r.conflict, r.disaster, r.food, r.seismic
       FROM latest_risks r
       JOIN countries c USING(code)
       WHERE c.code != ALL($5::text[])
       ORDER BY raw_score ASC`,
      [n1, n2, n3, n4, EXCLUDE]
    );

    if (!all.length) return res.json({ data: [], weights });

    // sqrt global normalisation → 0-100
    const vals  = all.map(r => r.raw_score);
    const minV  = Math.min(...vals);
    const maxV  = Math.max(...vals);
    const range = maxV - minV || 1;

    const scored = all.map((row, i) => ({
      rank:      i + 1,
      country:   row.name,
      code:      row.code,
      score:     (Math.sqrt((row.raw_score - minV) / range) * 100).toFixed(1),
      raw_score: Number(row.raw_score).toFixed(4),   // for client-side local normalization
      conflict:  Number(row.conflict).toFixed(1),
      disaster:  Number(row.disaster).toFixed(1),
      food:      Number(row.food).toFixed(1),
      seismic:   Number(row.seismic).toFixed(1),
    }));

    res.json({
      data: scored.slice(0, n),
      weights: { conflict: n1, disaster: n2, food: n3, seismic: n4 },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
