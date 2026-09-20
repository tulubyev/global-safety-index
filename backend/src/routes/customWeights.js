const express = require('express');
const router  = express.Router();
const { getDb } = require('../services/dbService');
const {
  DIMENSIONS, normalizeWeights, rawScore, scoreFromRaw,
} = require('../services/scoreService');

// Non-sovereign territories: not covered by INFORM / World Bank / UCDP as
// separate entities, so most dimensions are 0 and they would rank as the
// "safest" countries on earth. Excluded from rankings, still drawn on the map.
const EXCLUDE = [
  'HK', 'MO',                               // China SARs
  'PR', 'GU', 'VI', 'AS', 'MP',             // US territories
  'NC', 'PF', 'GP', 'MQ', 'RE', 'YT',       // France overseas
  'GL', 'FO',                               // Denmark
  'BM', 'KY', 'TC', 'VG', 'AI', 'MS', 'FK', // UK overseas
  'GI', 'IM', 'JE', 'GG',
  'AW', 'CW', 'SX', 'BQ',                   // Netherlands
  'AX', 'SJ',                               // Finland / Norway
];

// POST /api/custom-weights
// Body: { weights: { conflict, crime, disaster, food, seismic, pandemic }, top_n }
// Weights are non-negative and normalised server-side to sum = 1.
router.post('/', async (req, res) => {
  const { weights, top_n = 10 } = req.body;

  // Legacy array form is accepted in DIMENSIONS order
  let input;
  if (Array.isArray(weights)) {
    input = {};
    DIMENSIONS.forEach((d, i) => { input[d] = Number(weights[i]) || 0; });
  } else if (weights && typeof weights === 'object') {
    input = weights;
  } else {
    return res.status(400).json({ error: 'weights must be an object or array' });
  }

  const total = DIMENSIONS.reduce((a, d) => a + Math.max(0, Number(input[d]) || 0), 0);
  if (total === 0) return res.status(400).json({ error: 'all weights are zero' });

  const w = normalizeWeights(input);
  const n = Math.min(Number(top_n) || 10, 300);

  try {
    const db = getDb();

    // Scored in JS rather than SQL so the ranking uses exactly the same
    // formula as the map, the country panel and the weekly cron.
    const { rows } = await db.query(
      `SELECT c.code, c.name,
              COALESCE(r.conflict, 0)::float AS conflict,
              COALESCE(r.crime,    0)::float AS crime,
              COALESCE(r.disaster, 0)::float AS disaster,
              COALESCE(r.food,     0)::float AS food,
              COALESCE(r.seismic,  0)::float AS seismic,
              COALESCE(r.pandemic, 0)::float AS pandemic
       FROM latest_risks r
       JOIN countries c USING(code)
       WHERE c.code != ALL($1::text[])`,
      [EXCLUDE]
    );

    if (!rows.length) return res.json({ data: [], weights: w });

    const scored = rows
      .map(row => ({ row, raw: rawScore(row, w) }))
      .sort((a, b) => a.raw - b.raw)
      .slice(0, n)
      .map(({ row, raw }, i) => {
        const out = {
          rank:      i + 1,
          country:   row.name,
          code:      row.code,
          score:     scoreFromRaw(raw).toFixed(1),
          raw_score: raw.toFixed(4),   // client-side relative view within a group
        };
        for (const d of DIMENSIONS) out[d] = Number(row[d]).toFixed(1);
        return out;
      });

    res.json({ data: scored, weights: w });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
