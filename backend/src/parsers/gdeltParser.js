const https = require('https');
const http = require('http');
const unzipper = require('unzipper');
const { minMaxNormalize } = require('./normalizer');
const iso3to2 = require('./iso3to2');

const LASTUPDATE_URL = 'http://data.gdeltproject.org/gdeltv2/lastupdate.txt';

// GDELT v2 Export CSV columns
const COL = {
  ACTOR1_COUNTRY: 7,
  ACTOR2_COUNTRY: 15,
  QUAD_CLASS: 29,     // 3=Verbal Conflict, 4=Material Conflict
  GOLDSTEIN: 30,      // -10 (conflict) to +10 (cooperation)
  NUM_MENTIONS: 31,
};

function fetchText(url) {
  const lib = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    lib.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function downloadAndParse(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const scores = {};

    lib.get(url, (res) => {
      res.pipe(unzipper.Parse())
        .on('entry', (entry) => {
          // Only process the export CSV file
          if (!entry.path.toLowerCase().includes('export')) {
            entry.autodrain();
            return;
          }
          let buffer = '';
          entry.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              if (!line.trim()) continue;
              const cols = line.split('\t');
              if (cols.length < 35) continue;

              const quadClass = parseInt(cols[COL.QUAD_CLASS]);
              const goldstein = parseFloat(cols[COL.GOLDSTEIN]);
              const mentions = parseInt(cols[COL.NUM_MENTIONS]) || 1;

              // Only Material Conflict (QuadClass=4) = actual physical attacks/violence
              // Skip Verbal Conflict (QuadClass=3) which includes protests, diplomatic disputes, etc.
              if (quadClass !== 4) continue;
              if (goldstein >= -1) continue; // Only clearly negative events (conflict intensity > 1)

              const rawCodes = [
                cols[COL.ACTOR1_COUNTRY]?.trim(),
                cols[COL.ACTOR2_COUNTRY]?.trim(),
              ];
              const countries = new Set(rawCodes.map(iso3to2).filter(Boolean));

              for (const code of countries) {
                if (!code || code.length !== 2) continue;
                if (!scores[code]) scores[code] = { conflictScore: 0, mentions: 0 };
                const intensity = Math.max(0, -goldstein) * mentions;
                scores[code].conflictScore += intensity;
                scores[code].mentions += mentions;
              }
            }
          });
          entry.on('end', () => resolve(scores));
          entry.on('error', reject);
        })
        .on('error', reject);
    }).on('error', reject);
  });
}

function generateGdeltUrls(latestTs, count) {
  // GDELT files every 15 min: YYYYMMDDHHMMSS
  const urls = [];
  const ts = new Date(
    parseInt(latestTs.slice(0, 4)),
    parseInt(latestTs.slice(4, 6)) - 1,
    parseInt(latestTs.slice(6, 8)),
    parseInt(latestTs.slice(8, 10)),
    parseInt(latestTs.slice(10, 12)),
    0
  );
  for (let i = 0; i < count; i++) {
    const y = ts.getUTCFullYear();
    const mo = String(ts.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ts.getUTCDate()).padStart(2, '0');
    const h = String(ts.getUTCHours()).padStart(2, '0');
    const m = String(ts.getUTCMinutes()).padStart(2, '0');
    const stamp = `${y}${mo}${d}${h}${m}00`;
    urls.push(`http://data.gdeltproject.org/gdeltv2/${stamp}.export.CSV.zip`);
    ts.setUTCMinutes(ts.getUTCMinutes() - 15);
  }
  return urls;
}

async function fetchGdeltConflict(numFiles = 96) {
  console.log('[GDELT] Fetching file list...');
  const lastUpdate = await fetchText(LASTUPDATE_URL);

  // Extract timestamp from the export file URL e.g. 20260424024500.export.CSV.zip
  const exportLine = lastUpdate.trim().split('\n').find((l) => l.includes('.export.CSV.zip'));
  const match = exportLine && exportLine.match(/(\d{14})\.export/);
  if (!match) throw new Error('Cannot parse GDELT lastupdate.txt');

  const latestTs = match[1];
  const exportUrls = generateGdeltUrls(latestTs, numFiles);

  console.log(`[GDELT] Processing ${exportUrls.length} files (last ${numFiles * 15} min)...`);

  const merged = {};
  for (const url of exportUrls) {
    try {
      const scores = await downloadAndParse(url);
      for (const [code, data] of Object.entries(scores)) {
        if (!merged[code]) merged[code] = { conflictScore: 0, mentions: 0 };
        merged[code].conflictScore += data.conflictScore;
        merged[code].mentions += data.mentions;
      }
    } catch (err) {
      console.warn(`[GDELT] Failed to parse ${url}:`, err.message);
    }
  }

  // Use log-scaled total conflict score to compress dynamic range
  // log(1 + totalConflictIntensity) → reduces mega-country bias while preserving ordering
  const entries = Object.entries(merged)
    .filter(([, d]) => d.mentions > 0)
    .map(([code, d]) => ({
      code,
      rawScore: Math.log1p(d.conflictScore),
    }));

  return entries;
}

module.exports = { fetchGdeltConflict };
