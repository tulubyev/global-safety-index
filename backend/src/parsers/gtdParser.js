const https = require('https');

// Our World in Data — GTD-derived terrorism deaths by country (1970-2021), no auth required
const GTD_URL = 'https://ourworldindata.org/grapher/terrorism-deaths.csv';

// Fetch raw text over HTTPS
function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchCSV(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Returns array of { code2, weightedDeaths } for all countries.
 * Uses years FROM_YEAR–TO_YEAR with exponential decay (recent years weigh more).
 */
async function fetchGtdTerrorism({ fromYear = 2010, toYear = 2021, halfLife = 5 } = {}) {
  console.log('[GTD] Downloading terrorism deaths dataset...');
  const csv = await fetchCSV(GTD_URL);
  const lines = csv.trim().split('\n');

  // header: Entity,Code,Year,Fatalities,World region according to OWID
  const header = lines[0].split(',');
  const iCode  = header.indexOf('Code');
  const iYear  = header.indexOf('Year');
  const iFatal = header.indexOf('Fatalities');

  // Aggregate weighted deaths per ISO-3 code
  const byCode = {}; // iso3 → weightedDeaths

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const iso3     = cols[iCode]?.trim();
    const year     = parseInt(cols[iYear]);
    const fatals   = parseFloat(cols[iFatal]) || 0;

    if (!iso3 || iso3.length !== 3) continue;   // skip aggregates (OWID_WRL etc.)
    if (year < fromYear || year > toYear) continue;

    // Exponential decay: more recent year → higher weight
    const age    = toYear - year;
    const weight = Math.exp(-Math.log(2) * age / halfLife);

    if (!byCode[iso3]) byCode[iso3] = 0;
    byCode[iso3] += fatals * weight;
  }

  console.log(`[GTD] Aggregated data for ${Object.keys(byCode).length} countries`);
  return Object.entries(byCode).map(([iso3, weightedDeaths]) => ({ iso3, weightedDeaths }));
}

module.exports = { fetchGtdTerrorism };
