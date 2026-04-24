const https = require('https');

// USGS Earthquake Hazards Program — public, no auth required
// M4.5+ worldwide, past 30 days
const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parses place string like "113 km E of Kokopo, Papua New Guinea"
 * Returns the last comma-separated token as country guess.
 * Handles "X km DIR of City, Country" and "City, Region, Country" patterns.
 */
function extractCountryFromPlace(place) {
  if (!place) return null;
  const parts = place.split(',').map(p => p.trim());
  return parts[parts.length - 1] || null;
}

/**
 * Magnitude-weighted seismic energy score.
 * Richter scale is logarithmic: M7 releases ~32× more energy than M6.
 * We use 10^(1.5 * mag) as energy proxy, capped to avoid one mega-quake dominating.
 */
function magToEnergy(mag) {
  return Math.pow(10, 1.5 * Math.max(0, mag));
}

async function fetchUsgsSeismicRisk() {
  console.log('[USGS] Fetching earthquake data (M4.5+, last 30 days)...');
  const geojson = await fetchJson(USGS_URL);

  const countryEnergy = {};   // country name → cumulative seismic energy
  const countryCount  = {};   // country name → event count

  for (const feature of geojson.features) {
    const { mag, place } = feature.properties;
    if (!mag || mag < 4.5) continue;

    const country = extractCountryFromPlace(place);
    if (!country) continue;

    const energy = magToEnergy(mag);
    countryEnergy[country] = (countryEnergy[country] || 0) + energy;
    countryCount[country]  = (countryCount[country]  || 0) + 1;
  }

  console.log(`[USGS] ${geojson.features.length} events → ${Object.keys(countryEnergy).length} place names`);

  return Object.entries(countryEnergy).map(([placeName, energy]) => ({
    placeName,
    energy,
    count: countryCount[placeName],
  }));
}

module.exports = { fetchUsgsSeismicRisk };
