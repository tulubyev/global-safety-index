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

// ── WHO DON RSS ──────────────────────────────────────────────────────────────

const WHO_DON_RSS = 'https://www.who.int/feeds/entity/csr/don/en/rss.xml';

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

/**
 * Extract ISO2 country code from a WHO DON title like:
 *   "Mpox – Democratic Republic of the Congo"
 *   "Cholera – Haiti, Kenya, Nigeria"
 *   "Avian Influenza A(H5N1) – Cambodia"
 */
function extractCountriesFromTitle(title) {
  // WHO DON titles use em-dash (–) or hyphen (-) to separate disease from location
  const parts = title.split(/–|-/).map(s => s.trim());
  if (parts.length < 2) return [];

  // Everything after the first dash is location (may be comma-separated list)
  const locationPart = parts.slice(1).join(' ');
  const names = locationPart.split(',').map(s => s.trim().toLowerCase());

  const iso2s = [];
  for (const name of names) {
    if (COUNTRY_ALIASES[name]) {
      iso2s.push(COUNTRY_ALIASES[name]);
    } else {
      // Try to match against iso3to2 by checking common 2-letter codes
      // (fallback: skip if unknown)
    }
  }
  return iso2s;
}

function fetchRss(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'GlobalSafetyIndex/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parse WHO DON RSS and return Map<iso2, rawScore>.
 * rawScore = sum of (severity_weight × time_decay) for all outbreak items.
 */
async function fetchWhoDon() {
  const scores = new Map();

  console.log('[WHO] Fetching Disease Outbreak News RSS…');
  let xml;
  try {
    xml = await fetchRss(WHO_DON_RSS);
  } catch (err) {
    console.warn('[WHO] RSS fetch failed, skipping:', err.message);
    return scores;
  }

  // Simple regex-based XML item extraction (no external parser dependency)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
  const dateRegex  = /<pubDate>(.*?)<\/pubDate>/;

  let match;
  let count = 0;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block    = match[1];
    const titleM   = titleRegex.exec(block);
    const dateM    = dateRegex.exec(block);
    if (!titleM) continue;

    const title    = (titleM[1] || titleM[2] || '').trim();
    const dateStr  = dateM ? dateM[1].trim() : null;
    const decay    = dateStr ? timeDecay(dateStr) : 0.5;
    const severity = isPheic(title) ? 2.0 : 1.0;
    const contrib  = severity * decay;

    const iso2s = extractCountriesFromTitle(title);
    for (const iso2 of iso2s) {
      scores.set(iso2, (scores.get(iso2) || 0) + contrib);
    }
    count++;
  }

  console.log(`[WHO] Parsed ${count} DON items → ${scores.size} countries affected`);
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
 * @returns {Promise<Map<string, number>>}    Map<iso2, pandemicScore 0–100>
 */
async function fetchPandemicRisk(informData, reliefwebEpi) {
  // 1. WHO DON (dynamic, real-time)
  const whoRaw      = await fetchWhoDon();

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
