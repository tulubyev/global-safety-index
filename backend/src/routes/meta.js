'use strict';
const express = require('express');
const router  = express.Router();
const { getDb } = require('../services/dbService');
const cacheService = require('../services/cacheService');
const { DIMENSIONS, DEFAULT_WEIGHTS } = require('../services/scoreService');
const { PIPELINE_VERSION } = require('../services/pipelineVersion');

// GET /api/meta — what the index currently rests on.
// Published so the methodology page can state coverage from the live data
// rather than from a number written into the copy and left to rot.
router.get('/', async (req, res) => {
  const cacheKey = 'meta:v1';
  const cached = await cacheService.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const db = getDb();
    const { rows: [row] } = await db.query(
      `SELECT COUNT(*)::int AS countries,
              MAX(measured_at) AS updated,
              ${DIMENSIONS.map(d => `COUNT(${d})::int AS ${d}`).join(',\n              ')}
       FROM latest_risks`
    );

    const result = {
      formula:     PIPELINE_VERSION,
      updated:     row.updated,
      countries:   row.countries,
      dimensions:  DIMENSIONS.length,
      weights:     DEFAULT_WEIGHTS,
      // How many countries actually have a measurement for each dimension
      coverage:    Object.fromEntries(DIMENSIONS.map(d => [d, row[d]])),
    };

    await cacheService.set(cacheKey, result, 3600);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
