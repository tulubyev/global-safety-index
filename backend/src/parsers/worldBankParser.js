const https = require('https');

// SN.ITK.DEFC.ZS — Prevalence of undernourishment (% of population)
const INDICATOR = 'SN.ITK.DEFC.ZS';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchFoodData() {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${INDICATOR}?format=json&mrv=1&per_page=300`;
  const json = await fetchJson(url);

  if (!Array.isArray(json) || json.length < 2) throw new Error('Unexpected World Bank response');

  const results = [];
  for (const entry of json[1]) {
    if (!entry.value || !entry.countryiso3code) continue;
    results.push({
      code3: entry.countryiso3code,
      value: entry.value,      // % undernourishment 0-100
      year: entry.date,
    });
  }
  return results;
}

module.exports = { fetchFoodData };
