const express = require('express');
const router = express.Router();
const { getDb } = require('../services/dbService');

// POST /api/alerts/subscribe
router.post('/subscribe', async (req, res) => {
  const { fcm_token, country_code, threshold } = req.body;
  if (!fcm_token || !country_code) {
    return res.status(400).json({ error: 'fcm_token and country_code are required' });
  }

  try {
    const db = getDb();
    await db.query(
      `INSERT INTO alert_subscriptions (fcm_token, country_code, threshold)
       VALUES ($1, $2, $3)
       ON CONFLICT (fcm_token, country_code) DO UPDATE SET threshold = $3`,
      [fcm_token, country_code.toUpperCase(), threshold || 5.0]
    );
    res.status(201).json({ status: 'subscribed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
