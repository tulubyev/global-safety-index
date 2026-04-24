const https = require('https');
const fs    = require('fs');
const XLSX  = require('xlsx');

// INFORM Risk Index 2026 — EU JRC, public download, no auth required
const INFORM_URL  = 'https://drmkc.jrc.ec.europa.eu/inform-index/Portals/0/InfoRM/2026/INFORM_Risk_2026_v072.xlsx';
const LOCAL_XLSX  = '/tmp/inform2026.xlsx';
const SHEET_NAME  = 'INFORM Risk 2026 (a-z)';

// Column indices (0-based) in the data sheet
// Row 2 is header, Row 4+ is data
const COL = {
  country:       0,   // COUNTRY
  iso3:          1,   // ISO3
  informRisk:    2,   // INFORM RISK (0-10) — composite
  hazardExposure:6,   // HAZARD & EXPOSURE (0-10)
  natural:       7,   // Natural hazards (0-10)
  earthquake:    8,   // Earthquake
  flood:         9,   // River Flood
  tsunami:       10,  // Tsunami
  cyclone:       11,  // Tropical Cyclone
  drought:       13,  // Drought
  epidemic:      14,  // Epidemic
  humanHazard:   15,  // Human hazard (conflict component)
  vulnerability: 18,  // VULNERABILITY (0-10)
};

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) {
      console.log('[INFORM] Using cached file');
      return resolve();
    }
    console.log('[INFORM] Downloading INFORM Risk 2026...');
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function fetchInformRisk() {
  await downloadFile(INFORM_URL, LOCAL_XLSX);

  const workbook = XLSX.readFile(LOCAL_XLSX);
  const ws       = workbook.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found`);

  // Convert to array of arrays (row 4 onward = data, row 2 = header)
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const results = [];
  for (let i = 3; i < raw.length; i++) {   // row index 3 = excel row 4 (first data row)
    const row = raw[i];
    const iso3 = row[COL.iso3];
    if (!iso3 || typeof iso3 !== 'string' || iso3.length !== 3) continue;

    const get = (col) => {
      const v = parseFloat(row[col]);
      return isNaN(v) ? 0 : v;
    };

    results.push({
      iso3:          iso3.trim().toUpperCase(),
      country:       row[COL.country] || iso3,
      informRisk:    get(COL.informRisk),      // 0-10 composite
      natural:       get(COL.natural),          // 0-10 natural hazards only
      earthquake:    get(COL.earthquake),
      flood:         get(COL.flood),
      tsunami:       get(COL.tsunami),
      cyclone:       get(COL.cyclone),
      drought:       get(COL.drought),
      epidemic:      get(COL.epidemic),
      vulnerability: get(COL.vulnerability),   // 0-10 social vulnerability
    });
  }

  console.log(`[INFORM] Parsed ${results.length} countries`);
  return results;
}

module.exports = { fetchInformRisk };
