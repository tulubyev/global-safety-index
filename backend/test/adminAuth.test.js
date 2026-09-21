'use strict';
const test = require('node:test');
const assert = require('node:assert');
const admin = require('../src/routes/admin');

const { tokenConfigured, authorized } = admin;
const req = header => ({ get: () => header });

test('the endpoint stays disabled unless a long enough token is configured', () => {
  const saved = process.env.ADMIN_TOKEN;
  try {
    for (const v of [undefined, '', 'short', 'x'.repeat(15)]) {
      if (v === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = v;
      assert.strictEqual(tokenConfigured(), false, `must stay disabled for ${JSON.stringify(v)}`);
    }
    process.env.ADMIN_TOKEN = 'x'.repeat(16);
    assert.strictEqual(tokenConfigured(), true);
  } finally {
    if (saved === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = saved;
  }
});

test('only the exact bearer token is accepted', () => {
  const saved = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'correct-horse-battery-staple';
  try {
    assert.strictEqual(authorized(req('Bearer correct-horse-battery-staple')), true);
    assert.strictEqual(authorized(req('bearer correct-horse-battery-staple')), true, 'scheme is case-insensitive');

    for (const bad of [
      'Bearer correct-horse-battery-stapl',    // one char short
      'Bearer correct-horse-battery-staplex',  // one char long
      'Bearer CORRECT-HORSE-BATTERY-STAPLE',   // wrong case in the token
      'Bearer ',
      'Basic correct-horse-battery-staple',
      'correct-horse-battery-staple',          // no scheme
      '',
    ]) {
      assert.strictEqual(authorized(req(bad)), false, `must reject: ${JSON.stringify(bad)}`);
    }
  } finally {
    if (saved === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = saved;
  }
});

test('a missing authorization header is rejected, not crashed on', () => {
  const saved = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'y'.repeat(20);
  try {
    assert.strictEqual(authorized({ get: () => undefined }), false);
  } finally {
    if (saved === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = saved;
  }
});
