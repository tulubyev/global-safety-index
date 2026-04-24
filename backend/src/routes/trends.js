const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');
const axios = require('axios');

// GET /api/trends/:countryCode
router.get('/:countryCode', async (req, res) => {
  const code = req.params.countryCode.toUpperCase();

  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT measured_at AS date, conflict, disaster, food, score
       FROM risks
       WHERE country_code = $1
       ORDER BY measured_at ASC`,
      [code]
    );

    if (!rows.length) return res.status(404).json({ error: 'No data for this country' });

    let forecast = [];
    try {
      const mlUrl = process.env.ML_SERVICE_URL || 'http://ml:8000';
      const mlRes = await axios.post(`${mlUrl}/forecast`, { country_code: code, history: rows });
      forecast = mlRes.data.forecast;
    } catch {
      // ML service unavailable — return history only
    }

    res.json({ code, history: rows, forecast });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
