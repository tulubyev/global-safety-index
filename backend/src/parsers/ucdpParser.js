const https = require('https');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');

// UCDP GED 23.1 — free public CSV download, no token required
const UCDP_CSV_URL = 'https://ucdp.uu.se/downloads/ged/ged231-csv.zip';
const LOCAL_ZIP = '/tmp/ged231.zip';

function parseZipAndExtractCSV() {
  return new Promise((resolve, reject) => {
    const countries = {};

    fs.createReadStream(LOCAL_ZIP)
      .pipe(unzipper.Parse())
      .on('entry', (entry) => {
        if (!entry.path.toLowerCase().endsWith('.csv')) {
          entry.autodrain();
          return;
        }

        let buffer = '';
        let headers = null;

        entry.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;

            const cols = parseCSVLine(line);
            if (!headers) { headers = cols; continue; }

            const row = {};
            headers.forEach((h, i) => { row[h.trim()] = (cols[i] || '').trim(); });

            const country = row['country'] || row['country_txt'];
            const fatalities = parseInt(row['best'] || row['deaths_best'] || '0') || 0;
            const year = parseInt(row['year']) || 0;

            if (!country || year < 2015) continue;

            if (!countries[country]) countries[country] = { fatalities: 0, events: 0 };
            countries[country].fatalities += fatalities;
            countries[country].events += 1;
          }
        });

        entry.on('end', () => resolve(countries));
        entry.on('error', reject);
      })
      .on('error', reject);
  });
}

function downloadZip(url, dest) {
  return new Promise((resolve, reject) => {
    // Skip download if file already exists and is big enough
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000000) {
      console.log('[UCDP] Using cached ZIP file');
      return resolve();
    }
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadZip(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadAndParseCSV(url) {
  await downloadZip(url, LOCAL_ZIP);
  return parseZipAndExtractCSV();
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

async function fetchUcdpConflict() {
  console.log('[UCDP] Downloading GED dataset (~25MB)...');
  const countries = await downloadAndParseCSV(UCDP_CSV_URL);
  console.log(`[UCDP] Parsed ${Object.keys(countries).length} countries`);
  return Object.entries(countries).map(([name, d]) => ({ name, fatalities: d.fatalities, events: d.events }));
}

module.exports = { fetchUcdpConflict };
