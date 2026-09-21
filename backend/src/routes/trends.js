const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');
const { DIMENSIONS } = require('../services/scoreService');
const { PIPELINE_VERSION } = require('../services/pipelineVersion');

// GET /api/trends/:countryCode
//
// Only rows from the current pipeline generation are returned. Older rows were
// scored on a different scale, and plotting them on one axis would show a step
// where the methodology changed, not where the country did.
router.get('/:countryCode', async (req, res) => {
  const code = req.params.countryCode.toUpperCase();

  try {
    const db = getDb();

    const { rows } = await db.query(
      `SELECT measured_at AS date, ${DIMENSIONS.join(', ')}, score
       FROM risks
       WHERE country_code = $1 AND source = $2
       ORDER BY measured_at ASC`,
      [code, PIPELINE_VERSION]
    );

    const { rows: [older] } = await db.query(
      `SELECT COUNT(*)::int AS n FROM risks
       WHERE country_code = $1 AND source IS DISTINCT FROM $2`,
      [code, PIPELINE_VERSION]
    );

    res.json({
      code,
      history: rows,
      // Comparable history only starts once the pipeline has run repeatedly on
      // the current formula; until then the chart has nothing honest to show.
      superseded_points: older ? older.n : 0,
      formula: PIPELINE_VERSION,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
