'use strict';
/**
 * ACLED API parser
 * Docs: https://acleddata.com/api-documentation/getting-started
 *
 * Auth: OAuth2 password grant (new myACLED system, old API keys retired Sep 2025)
 *   POST https://acleddata.com/oauth/token
 *   { username, password, grant_type:'password', client_id:'acled', scope:'authenticated' }
 *   → Bearer token valid 24h
 *
 * Endpoint: https://acleddata.com/api/acled/read
 *
 * Strategy:
 *  - Fetch Battles + Explosions/Remote violence + Violence against civilians
 *  - Years 2020 → current year, paginated (5000 rows/page)
 *  - Weighted fatalities: exponential decay, half-life = 2 years
 *  - Returns Map<iso2, weightedFatalities>
 */

const TOKEN_URL = 'https://acleddata.com/oauth/token';
const API_URL   = 'https://acleddata.com/api/acled/read';

// Event types that represent actual violence (skip Protests/Riots/Strategic developments)
const VIOLENT_TYPES = [
  'Battles',
  'Explosions/Remote violence',
  'Violence against civilians',
].join('|');

const HALF_LIFE_YEARS = 2;

/** Get OAuth bearer token using myACLED credentials */
async function getToken() {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username:   process.env.ACLED_EMAIL    || '',
      password:   process.env.ACLED_PASSWORD || '',
      grant_type: 'password',
      client_id:  'acled',
      scope:      'authenticated',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ACLED OAuth failed ${res.status}: ${text}\n\nMake sure you have a myACLED account at https://acleddata.com/register/`);
  }
  const json = await res.json();
  return json.access_token;
}

/** Fetch one page of ACLED events */
async function fetchPage(token, startYear, page) {
  const currentYear = new Date().getFullYear();

  const params = new URLSearchParams({
    _format:    'json',
    event_type: VIOLENT_TYPES,
    year:       `${startYear}|${currentYear}`,
    year_where: 'BETWEEN',
    fields:     'event_date|country|iso|fatalities',
    limit:      '5000',
    page:       String(page),
  });

  const res = await fetch(`${API_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ACLED API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json.data || [];
}

/**
 * Fetch all violent events since startYear and aggregate
 * weighted fatalities per country (ISO2).
 * @returns {Map<string, number>} iso2 → weightedFatalities
 */
async function fetchAcledConflict(startYear = 2020) {
  console.log('[ACLED] Authenticating via OAuth (myACLED)…');
  const token = await getToken();
  console.log('[ACLED] Token obtained. Fetching events…');

  const now    = Date.now();
  const totals = new Map(); // iso2 → weightedFatalities
  let   page   = 1;

  while (true) {
    console.log(`[ACLED] Fetching page ${page}…`);
    const rows = await fetchPage(token, startYear, page);

    if (!rows.length) {
      console.log('[ACLED] Empty page, done.');
      break;
    }

    for (const row of rows) {
      const iso2 = normalizeIso(row.iso);
      if (!iso2) continue;

      const fatalities = Number(row.fatalities) || 0;
      if (fatalities === 0) continue;

      const eventDate = new Date(row.event_date);
      const ageYears  = (now - eventDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      const weight    = Math.exp(-Math.LN2 * ageYears / HALF_LIFE_YEARS);

      totals.set(iso2, (totals.get(iso2) || 0) + fatalities * weight);
    }

    console.log(`[ACLED] Page ${page}: ${rows.length} rows`);

    if (rows.length < 5000) break; // last page
    page++;

    // Polite delay between pages
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[ACLED] Done. ${totals.size} countries with violent events.`);
  return totals;
}

/**
 * ACLED returns `iso` as a 3-digit numeric ISO code (e.g. 004 = Afghanistan).
 * Convert to ISO2 via lookup table.
 */
function normalizeIso(raw) {
  if (!raw) return null;
  const num = String(Number(raw)); // strip leading zeros
  return ISO_NUMERIC_TO_2[num] || null;
}

// ISO numeric → ISO2 mapping
const ISO_NUMERIC_TO_2 = {
  '4':   'AF', '8':   'AL', '12':  'DZ', '24':  'AO', '32':  'AR',
  '36':  'AU', '40':  'AT', '50':  'BD', '56':  'BE', '68':  'BO',
  '76':  'BR', '104': 'MM', '108': 'BI', '120': 'CM', '124': 'CA',
  '140': 'CF', '144': 'LK', '148': 'TD', '152': 'CL', '156': 'CN',
  '170': 'CO', '178': 'CG', '180': 'CD', '188': 'CR', '191': 'HR',
  '192': 'CU', '214': 'DO', '218': 'EC', '818': 'EG', '222': 'SV',
  '231': 'ET', '246': 'FI', '250': 'FR', '266': 'GA', '276': 'DE',
  '288': 'GH', '320': 'GT', '324': 'GN', '332': 'HT', '356': 'IN',
  '360': 'ID', '368': 'IQ', '364': 'IR', '372': 'IE', '376': 'IL',
  '388': 'JM', '400': 'JO', '404': 'KE', '408': 'KP', '410': 'KR',
  '414': 'KW', '418': 'LA', '422': 'LB', '430': 'LR', '434': 'LY',
  '454': 'MW', '458': 'MY', '466': 'ML', '484': 'MX', '504': 'MA',
  '508': 'MZ', '516': 'NA', '524': 'NP', '528': 'NL', '562': 'NE',
  '566': 'NG', '586': 'PK', '275': 'PS', '591': 'PA', '598': 'PG',
  '600': 'PY', '604': 'PE', '608': 'PH', '616': 'PL', '630': 'PR',
  '646': 'RW', '682': 'SA', '686': 'SN', '694': 'SL', '706': 'SO',
  '710': 'ZA', '724': 'ES', '729': 'SD', '760': 'SY', '764': 'TH',
  '788': 'TN', '792': 'TR', '800': 'UG', '804': 'UA', '784': 'AE',
  '826': 'GB', '840': 'US', '858': 'UY', '860': 'UZ', '862': 'VE',
  '704': 'VN', '887': 'YE', '894': 'ZM', '716': 'ZW', '232': 'ER',
  '703': 'SK', '705': 'SI', '643': 'RU', '270': 'GM', '624': 'GW',
  '384': 'CI', '854': 'BF', '204': 'BJ', '768': 'TG', '800': 'UG',
  '440': 'LT', '428': 'LV', '233': 'EE', '246': 'FI', '578': 'NO',
  '752': 'SE', '756': 'CH', '620': 'PT', '300': 'GR', '348': 'HU',
  '616': 'PL', '642': 'RO', '100': 'BG', '112': 'BY', '498': 'MD',
  '688': 'RS', '807': 'MK', '70':  'BA', '8':   'AL', '499': 'ME',
  '414': 'KW', '634': 'QA', '48':  'BH', '512': 'OM', '887': 'YE',
  '760': 'SY', '368': 'IQ', '364': 'IR', '422': 'LB', '275': 'PS',
  '788': 'TN', '434': 'LY', '818': 'EG', '504': 'MA', '12':  'DZ',
  '706': 'SO', '232': 'ER', '231': 'ET', '404': 'KE', '800': 'UG',
  '646': 'RW', '108': 'BI', '834': 'TZ', '508': 'MZ', '716': 'ZW',
  '454': 'MW', '894': 'ZM', '710': 'ZA', '516': 'NA', '72':  'BW',
  '748': 'SZ', '426': 'LS', '24':  'AO', '180': 'CD', '178': 'CG',
  '140': 'CF', '120': 'CM', '266': 'GA', '624': 'GW', '694': 'SL',
  '430': 'LR', '384': 'CI', '288': 'GH', '204': 'BJ', '854': 'BF',
  '466': 'ML', '562': 'NE', '566': 'NG', '768': 'TG', '270': 'GM',
  '686': 'SN', '324': 'GN', '90':  'SB', '548': 'VU', '598': 'PG',
  '242': 'FJ', '776': 'TO', '585': 'PW', '584': 'MH', '583': 'FM',
};

module.exports = { fetchAcledConflict };
