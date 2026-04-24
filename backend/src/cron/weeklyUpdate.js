const cron = require('node-cron');
const { fetchConflictData } = require('../parsers/acledParser');
const { fetchWriData } = require('../parsers/wriParser');
const { fetchGfsiData } = require('../parsers/gfsiParser');
const { minMaxNormalize } = require('../parsers/normalizer');
const { getDb } = require('../services/dbService');
const cacheService = require('../services/cacheService');

// Every Monday at 06:00 UTC
cron.schedule('0 6 * * 1', async () => {
  console.log('[cron] Starting weekly safety data update');
  try {
    // TODO: aggregate raw data from parsers, normalize, upsert into risks table
    // Then flush relevant cache keys
    await cacheService.del('top10:10');
    console.log('[cron] Weekly update complete');
  } catch (err) {
    console.error('[cron] Weekly update failed:', err);
  }
});
