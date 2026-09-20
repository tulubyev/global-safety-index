'use strict';
/**
 * WHO Pandemic Risk Parser
 *
 * Combines three sources into a pandemic score per country (0–100):
 *
 * 1. INFORM epidemic column  — structural vulnerability (healthcare, response
 *    capacity). Scale 0–10. Weight: 40% of final score.
 *    Source: EU JRC INFORM Risk Index (already fetched by informParser.js)
 *
 * 2. WHO Disease Outbreak News (DON) RSS — official WHO alerts on disease
 *    outbreaks. Parsed from RSS XML, time-decayed, boosted for PHEIC events.
 *    URL: https://www.who.int/feeds/entity/csr/don/en/rss.xml
 *    Weight: 35% of final score.
 *
 * 3. ReliefWeb epidemic events — ongoing epidemic disasters from ReliefWeb
 *    (extracted separately from disaster score to avoid double-counting).
 *    Passed in as Map<iso2, rawScore> from reliefwebParser.fetchReliefwebEpidemics().
 *    Weight: 25% of final score.
 *
 * Final pandemic score = normalized(INFORM) * 0.40
 *                      + normalized(WHO DON) * 0.35
 *                      + normalized(ReliefWeb epidemic) * 0.25
 *
 * Result: Map<iso2, pandemicScore>  where pandemicScore ∈ [0, 100]
 */

const https   = require('https');
const iso3to2 = require('./iso3to2');

// ── WHO DON (OData API behind who.int; the old RSS feed is gone — 404) ──────

const WHO_DON_API =
  'https://www.who.int/api/news/diseaseoutbreaknews'
  + '?$orderby=PublicationDateAndTime%20desc&$top=100'
  + '&$select=Title,PublicationDateAndTime,DonId,UrlName';
const USER_AGENT = 'WorldSafetyIndex/1.0 (+https://worldsafetyindex.org)';

// Country name aliases: WHO uses full/varied names, map to ISO2
// Covers the most common cases; unmatched names are skipped gracefully.
const COUNTRY_ALIASES = {
  'democratic republic of the congo': 'CD',
  'congo':                            'CG',
  'dr congo':                         'CD',
  'drc':                              'CD',
  'republic of korea':                'KR',
  'korea':                            'KR',
  'united states of america':         'US',
  'united states':                    'US',
  'usa':                              'US',
  'united kingdom':                   'GB',
  'uk':                               'GB',
  'tanzania':                         'TZ',
  'united republic of tanzania':      'TZ',
  'iran':                             'IR',
  'islamic republic of iran':         'IR',
  'russia':                           'RU',
  'russian federation':               'RU',
  'syria':                            'SY',
  'syrian arab republic':             'SY',
  'vietnam':                          'VN',
  'viet nam':                         'VN',
  'bolivia':                          'BO',
  'venezuela':                        'VE',
  'laos':                             'LA',
  "lao people's democratic republic": 'LA',
  'moldova':                          'MD',
  'republic of moldova':              'MD',
  'north korea':                      'KP',
  "democratic people's republic of korea": 'KP',
};

// Known PHEIC (Public Health Emergency of International Concern) disease keywords.
// WHO declares PHEIC for the most severe global threats.
// Events matching these get a ×2.0 severity boost.
const PHEIC_KEYWORDS = [
  'pheic', 'public health emergency of international concern',
  'covid', 'sars', 'ebola', 'marburg', 'polio', 'mpox', 'monkeypox',
  'influenza pandemic', 'avian influenza h5',
  'honorvirus', 'norovirus outbreak',   // include emerging threats by name
];

const HALF_LIFE_DAYS = 180;             // 6-month half-life for outbreak news
const LAMBDA         = Math.LN2 / HALF_LIFE_DAYS;

function timeDecay(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return 0.5;
  const ageDays = Math.max(0, (Date.now() - d) / 86400000);
  return Math.exp(-LAMBDA * ageDays);
}

function isPheic(text) {
  const lower = text.toLowerCase();
  return PHEIC_KEYWORDS.some(kw => lower.includes(kw));
}

/** "Democratic Republic of the Congo (DRC)" -> "democratic republic of the congo" */
function cleanName(s) {
  return String(s || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')      // drop "(H5N1)", "(AFRO)", "(DRC)"
    .replace(/[^a-z\s'-]/g, ' ')    // drop digits, colons, ampersands, dashes of any kind
    .replace(/-/g, ' ')             // hyphen is a word boundary: "A(H5N2)-Mexico"
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Titles that describe a global or regional situation rather than named countries.
// Matched after cleanName(), so hyphens are already spaces.
const NON_COUNTRY_SCOPES = [
  'global', 'worldwide', 'multi country', 'multi locations', 'multiple countries',
  'region of the americas', 'african region', 'european region',
  'western pacific', 'south east asia', 'eastern mediterranean',
  'northern hemisphere', 'southern hemisphere',
];

// Disease names that embed a country name — removed before scanning so that
// "Crimean-Congo haemorrhagic fever" does not resolve to Congo.
const DISEASE_NOISE = [
  'crimean congo',
  'middle east respiratory syndrome',
  'guinea worm',
];

/**
 * Build a country matcher from the aliases above plus an external
 * Map<lowercase name, iso2> (the `countries` table + INFORM names, passed in
 * by the cron).
 *
 * findAll() scans the WHOLE title instead of splitting on a separator: WHO
 * titles use every punctuation style there is ("disease- Ethiopia",
 * "A(H5N2)-Mexico", "virus, DR Congo & Uganda", "type 1- Israel"), and the
 * disease name itself often contains a hyphen. Longest names match first and
 * each match is blanked out, so "Democratic Republic of the Congo" cannot then
 * also match "Congo", and "Nigeria" cannot also match "Niger".
 */
function buildResolver(nameToIso2) {
  const entries = new Map();
  if (nameToIso2) for (const [n, c] of nameToIso2) entries.set(cleanName(n), c);
  for (const [n, c] of Object.entries(COUNTRY_ALIASES)) entries.set(cleanName(n), c);
  entries.delete('');

  const sorted = [...entries.entries()]
    .filter(([n]) => n.length >= 4)
    .sort((a, b) => b[0].length - a[0].length);

  return {
    /** true when the title names no country at all (global / regional scope) */
    isGlobalScope(text) {
      const t = cleanName(text);
      return NON_COUNTRY_SCOPES.some(scope => t.includes(scope));
    },

    /** every ISO2 whose country name appears in `text` */
    findAll(text) {
      let hay = ' ' + cleanName(text) + ' ';
      for (const noise of DISEASE_NOISE) hay = hay.split(noise).join(' ');

      const found = new Set();
      for (const [name, iso2] of sorted) {
        if (found.has(iso2)) continue;
        const i = hay.indexOf(' ' + name + ' ');
        if (i < 0) continue;
        found.add(iso2);
        // blank the match so a shorter name inside it cannot match too
        hay = hay.slice(0, i + 1) + ' '.repeat(name.length) + hay.slice(i + 1 + name.length);
      }
      return [...found];
    },
  };
}

/**
 * ISO2 codes named in a WHO DON title, e.g.
 *   "Ebola ... , Democratic Republic of the Congo & Uganda"  -> [CD, UG]
 *   "Marburg virus disease- Ethiopia"                        -> [ET]
 *   "Human infection ... Influenza A(H5N2)-Mexico"           -> [MX]
 *   "Dengue - Global situation"                              -> []  (global scope)
 */
function extractCountriesFromTitle(title, matcher) {
  if (matcher.isGlobalScope(title)) return [];
  return matcher.findAll(title);
}

function fetchJson(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return fetchJson(new URL(res.headers.location, url).href, redirects - 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 120)}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Bad JSON from WHO: ${e.message}`)); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Fetch WHO Disease Outbreak News via the who.int OData API and return
 * Map<iso2, rawScore>, rawScore = Σ severity_weight × time_decay per item.
 */
async function fetchWhoDon(nameToIso2) {
  const scores  = new Map();
  const matcher = buildResolver(nameToIso2);
  const unmatched = [];
  let globalScope = 0;

  console.log('[WHO] Fetching Disease Outbreak News (OData API)…');
  let items;
  try {
    const json = await fetchJson(WHO_DON_API);
    items = Array.isArray(json.value) ? json.value : [];
  } catch (err) {
    console.warn('[WHO] DON fetch failed, skipping:', err.message);
    return scores;
  }

  let count = 0;
  for (const it of items) {
    const title   = String(it.Title || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const dateStr = it.PublicationDateAndTime || null;
    const decay   = dateStr ? timeDecay(dateStr) : 0.5;
    const severity = isPheic(title) ? 2.0 : 1.0;
    const contrib  = severity * decay;

    const iso2s = extractCountriesFromTitle(title, matcher);
    if (!iso2s.length) {
      if (matcher.isGlobalScope(title)) globalScope++;
      else unmatched.push(title);
    }
    for (const iso2 of iso2s) {
      scores.set(iso2, (scores.get(iso2) || 0) + contrib);
    }
    count++;
  }

  if (unmatched.length) {
    console.warn(`[WHO] No country in ${unmatched.length} title(s): ${unmatched.slice(0, 6).map(t => `"${t}"`).join(', ')}${unmatched.length > 6 ? ' …' : ''}`);
  }
  console.log(`[WHO] Parsed ${count} DON items → ${scores.size} countries affected `
    + `(${globalScope} global/regional, ${unmatched.length} unresolved)`);
  return scores;
}

// ── INFORM epidemic score ────────────────────────────────────────────────────

/**
 * Convert INFORM epidemic column (0–10 scale) to a Map<iso2, rawScore>.
 * informData is the array returned by fetchInformRisk() from informParser.js.
 */
function buildInformEpidemicMap(informData) {
  const map = new Map();
  for (const row of informData) {
    const iso2 = iso3to2(row.iso3);
    if (!iso2) continue;
    // INFORM epidemic is 0–10; multiply by 10 to get 0–100 range before normalization
    map.set(iso2, (row.epidemic || 0) * 10);
  }
  return map;
}

// ── Normalization helper ─────────────────────────────────────────────────────

function normalizeMap(map) {
  if (!map.size) return map;
  const vals = [...map.values()];
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 1;
  const out  = new Map();
  for (const [k, v] of map) {
    out.set(k, ((v - min) / range) * 100);
  }
  return out;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute pandemic score for all countries.
 *
 * @param {Array}            informData       — result of fetchInformRisk()
 * @param {Map<string,number>} reliefwebEpi   — result of fetchReliefwebEpidemics()
 * @param {Map<string,string>} [nameToIso2]   — lowercase country name → iso2 (from DB)
 * @returns {Promise<Map<string, number>>}    Map<iso2, pandemicScore 0–100>
 */
async function fetchPandemicRisk(informData, reliefwebEpi, nameToIso2) {
  // 1. WHO DON (dynamic, real-time)
  const whoRaw      = await fetchWhoDon(nameToIso2);

  // 2. INFORM epidemic (structural vulnerability)
  const informRaw   = buildInformEpidemicMap(informData);

  // 3. Normalize all three sources to 0–100
  const whoNorm     = normalizeMap(whoRaw);
  const informNorm  = normalizeMap(informRaw);
  const reliefNorm  = normalizeMap(reliefwebEpi);

  // 4. Combine: collect all known iso2 codes
  const allCodes = new Set([
    ...whoNorm.keys(),
    ...informNorm.keys(),
    ...reliefNorm.keys(),
  ]);

  const result = new Map();
  for (const iso2 of allCodes) {
    const inform  = informNorm.get(iso2)  || 0;
    const who     = whoNorm.get(iso2)     || 0;
    const relief  = reliefNorm.get(iso2)  || 0;

    const score = inform * 0.40 + who * 0.35 + relief * 0.25;
    result.set(iso2, Math.min(100, Math.round(score * 10) / 10));
  }

  console.log(`[WHO] Pandemic risk computed for ${result.size} countries`);
  return result;
}

module.exports = { fetchPandemicRisk };
