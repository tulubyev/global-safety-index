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

/**
 * USGS returns place name strings, not ISO codes.
 * Build a rough country-name → iso2 lookup from a known list.
 * Unmatched entries are dropped.
 */
const PLACE_TO_ISO2 = {
  'afghanistan': 'AF', 'albania': 'AL', 'algeria': 'DZ', 'argentina': 'AR',
  'armenia': 'AM', 'australia': 'AU', 'austria': 'AT', 'azerbaijan': 'AZ',
  'bolivia': 'BO', 'bosnia': 'BA', 'brazil': 'BR', 'bulgaria': 'BG',
  'burma': 'MM', 'myanmar': 'MM', 'cambodia': 'KH', 'cameroon': 'CM',
  'canada': 'CA', 'chile': 'CL', 'china': 'CN', 'colombia': 'CO',
  'comoros': 'KM', 'congo': 'CD', 'costa rica': 'CR', 'croatia': 'HR',
  'cuba': 'CU', 'cyprus': 'CY', 'czechia': 'CZ', 'czech republic': 'CZ',
  'ecuador': 'EC', 'egypt': 'EG', 'el salvador': 'SV', 'eritrea': 'ER',
  'ethiopia': 'ET', 'fiji': 'FJ', 'france': 'FR', 'georgia': 'GE',
  'germany': 'DE', 'greece': 'GR', 'guatemala': 'GT', 'haiti': 'HT',
  'honduras': 'HN', 'hungary': 'HU', 'iceland': 'IS', 'india': 'IN',
  'indonesia': 'ID', 'iran': 'IR', 'iraq': 'IQ', 'israel': 'IL',
  'italy': 'IT', 'jamaica': 'JM', 'japan': 'JP', 'jordan': 'JO',
  'kazakhstan': 'KZ', 'kenya': 'KE', 'kyrgyzstan': 'KG', 'laos': 'LA',
  'lebanon': 'LB', 'libya': 'LY', 'madagascar': 'MG', 'malaysia': 'MY',
  'maldives': 'MV', 'mali': 'ML', 'mauritania': 'MR', 'mexico': 'MX',
  'mongolia': 'MN', 'morocco': 'MA', 'mozambique': 'MZ', 'nepal': 'NP',
  'new caledonia': 'NC', 'new zealand': 'NZ', 'nicaragua': 'NI',
  'niger': 'NE', 'nigeria': 'NG', 'north korea': 'KP', 'norway': 'NO',
  'oman': 'OM', 'pakistan': 'PK', 'panama': 'PA', 'papua new guinea': 'PG',
  'peru': 'PE', 'philippines': 'PH', 'poland': 'PL', 'portugal': 'PT',
  'puerto rico': 'PR', 'romania': 'RO', 'russia': 'RU', 'rwanda': 'RW',
  'saudi arabia': 'SA', 'serbia': 'RS', 'solomon islands': 'SB',
  'somalia': 'SO', 'south africa': 'ZA', 'south korea': 'KR',
  'spain': 'ES', 'sri lanka': 'LK', 'sudan': 'SD', 'syria': 'SY',
  'taiwan': 'TW', 'tajikistan': 'TJ', 'tanzania': 'TZ', 'thailand': 'TH',
  'timor-leste': 'TL', 'tonga': 'TO', 'turkey': 'TR', 'türkiye': 'TR',
  'turkmenistan': 'TM', 'uganda': 'UG', 'ukraine': 'UA',
  'united states': 'US', 'usa': 'US', 'uzbekistan': 'UZ',
  'vanuatu': 'VU', 'venezuela': 'VE', 'vietnam': 'VN', 'viet nam': 'VN',
  'yemen': 'YE', 'zambia': 'ZM', 'zimbabwe': 'ZW',
};

// Longest names first + word boundaries, so "nigeria" never matches "niger",
// "somalia" never matches "mali", "romania" never matches "oman".
const PLACE_PATTERNS = Object.entries(PLACE_TO_ISO2)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([key, iso2]) => ({
    re:   new RegExp(`(^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i'),
    iso2,
  }));

function placeToIso2(placeName) {
  const lower = placeName.toLowerCase().trim();
  if (PLACE_TO_ISO2[lower]) return PLACE_TO_ISO2[lower];
  for (const { re, iso2 } of PLACE_PATTERNS) {
    if (re.test(lower)) return iso2;
  }
  return null;
}

/**
 * Convert USGS placeName → iso2 Map of log10(energy).
 * Energy is 10^(1.5·M): one M7 is ~5600× an M4.5, so summing raw energy lets
 * a single quake pin one country at 100 and everyone else at ~0. Log-scale
 * keeps the ordering but compresses the range to something comparable.
 */
function usgsToIso2Map(usgsData) {
  const energy = new Map();
  for (const { placeName, energy: e } of usgsData) {
    const iso2 = placeToIso2(placeName);
    if (!iso2) continue;
    energy.set(iso2, (energy.get(iso2) || 0) + e);
  }
  const out = new Map();
  for (const [iso2, e] of energy) out.set(iso2, Math.log10(e));
  return out;
}

module.exports = { fetchUsgsSeismicRisk, placeToIso2, usgsToIso2Map };

