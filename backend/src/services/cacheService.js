const Redis = require('ioredis');

const TTL_SECONDS = 6 * 60 * 60; // 6 hours

let client;

function getClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    client.on('error', (err) => console.error('Redis error:', err));
  }
  return client;
}

async function get(key) {
  try {
    const data = await getClient().get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

async function set(key, value) {
  try {
    await getClient().setex(key, TTL_SECONDS, JSON.stringify(value));
  } catch {
    // cache write failure is non-fatal
  }
}

async function del(key) {
  try {
    await getClient().del(key);
  } catch {}
}

module.exports = { get, set, del };
