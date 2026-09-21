'use strict';
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { runWeeklyUpdate } = require('../cron/weeklyUpdate');
const { PIPELINE_VERSION } = require('../services/pipelineVersion');

// Disabled unless ADMIN_TOKEN is set — an unauthenticated trigger for a job
// that rewrites every risk row and hammers half a dozen upstream APIs would be
// a denial-of-service lever pointed at us and at them.
function tokenConfigured() {
  const t = process.env.ADMIN_TOKEN;
  return typeof t === 'string' && t.length >= 16;
}

function authorized(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  if (!m) return false;
  // Hash both sides so the comparison is constant-time and does not leak length
  const digest = v => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(digest(m[1]), digest(process.env.ADMIN_TOKEN));
}

let running = null;   // { startedAt } while a run is in flight

// POST /api/admin/run-update — trigger the pipeline out of schedule
router.post('/run-update', (req, res) => {
  if (!tokenConfigured()) {
    return res.status(503).json({
      error: 'Admin endpoint disabled: set ADMIN_TOKEN (16+ chars) to enable',
    });
  }
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (running) {
    return res.status(409).json({ error: 'Update already running', started_at: running.startedAt });
  }

  const startedAt = new Date().toISOString();
  running = { startedAt };

  // The run takes minutes; answer now and let it proceed in the background.
  res.status(202).json({ status: 'started', started_at: startedAt, formula: PIPELINE_VERSION });

  runWeeklyUpdate()
    .then(() => console.log('[admin] Manual update finished'))
    .catch(err => console.error('[admin] Manual update failed:', err.message))
    .finally(() => { running = null; });
});

// GET /api/admin/status — is a run in flight?
router.get('/status', (req, res) => {
  if (!tokenConfigured()) return res.status(503).json({ error: 'Admin endpoint disabled' });
  if (!authorized(req))   return res.status(401).json({ error: 'Unauthorized' });
  res.json({ running: Boolean(running), started_at: running?.startedAt ?? null, formula: PIPELINE_VERSION });
});

module.exports = router;
// exported for tests — the auth path is the security-critical part
module.exports.tokenConfigured = tokenConfigured;
module.exports.authorized = authorized;
