const { Pool } = require('pg');

let pool;

function getDb() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

module.exports = { getDb };
