'use strict';
/**
 * Weekly data pipeline — runs every Monday 06:00 UTC
 *
 * Flow:
 *  1. Fetch raw data from all sources in parallel where possible
 *  2. Normalize each dimension to 0–100 across all countries
 *  3. Compute composite score using default weights
 *  4. Upsert into `risks` table (one row per country per date)
 *  5. Flush all relevant cache keys
 *
 * Dimensions and their sources:
 *  conflict  — UCDP GED + candidate events (fatalities, 2-yr half-life); ACLED as fallback
 *  disaster  — INFORM flood/cyclone/drought/tsunami (70%) + ReliefWeb ongoing disasters (30%)
 *  food      — World Bank undernourishment % (most recent year)
 *  seismic   — INFORM earthquake hazard (80%) + USGS M4.5+ last 30 days, log energy (20%)
 *  pandemic  — INFORM epidemic + WHO DON RSS + ReliefWeb epidemic events
 *
 * Default weights live in services/scoreService.js (user can override via /api/custom-weights).
 */

const cron = require('node-cron');

const { fetchAcledConflict }        = require('../parsers/acledParser');
const { fetchUcdpConflict }         = require('../parsers/ucdpParser');
const { fetchInformRisk }           = require('../parsers/informParser');
const { fetchFoodData }             = require('../parsers/worldBankParser');
const { fetchUsgsSeismicRisk }      = require('../parsers/usgsParser');
const { fetchReliefwebDisasters,
        fetchReliefwebEpidemics }   = require('../parsers/reliefwebParser');
const { fetchPandemicRisk }         = require('../parsers/whoParser');
const iso3to2                       = require('../parsers/iso3to2');
const { minMaxNormalize }           = require('../parsers/normalizer');
const { getDb }                     = require('../services/dbService');
const cacheService                  = require('../services/cacheService');
const { compositeScore }            = require('../services/scoreService');

// Sub-weights inside a dimension (structural index vs. recent events)
const DISASTER_STRUCT_W = 0.70;   // INFORM flood/cyclone/drought/tsunami
const DISASTER_EVENT_W  = 0.30;   // ReliefWeb ongoing disasters
const SEISMIC_STRUCT_W  = 0.80;   // INFORM earthquake hazard
const SEISMIC_EVENT_W   = 0.20;   // USGS M4.5+ last 30 days (log energy)

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a Map<iso2, rawValue> → Map<iso2, 0–100> */
function normalizeMapValues(map) {
  if (!map.size) return map;
  const keys = [...map.keys()];
  const vals = [...map.values()];
  const norm = minMaxNormalize(vals);
  const out  = new Map();
  keys.forEach((k, i) => out.set(k, norm[i]));
  return out;
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

/** Convert World Bank food array → Map<iso2, value> */
function foodToIso2Map(foodData) {
  const map = new Map();
  for (const { code3, value } of foodData) {
    const iso2 = iso3to2(code3);
    if (!iso2) continue;
    map.set(iso2, value);
  }
  return map;
}

/**
 * INFORM non-seismic natural hazards → Map<iso2, 0–100>.
 * Mean of flood / cyclone / drought / tsunami (each 0–10) × 10.
 * Earthquake is deliberately excluded here — it lives in the seismic
 * dimension, otherwise it would be counted twice.
 */
function informNonSeismicMap(informData) {
  const map = new Map();
  for (const row of informData) {
    const iso2 = iso3to2(row.iso3);
    if (!iso2) continue;
    const parts = [row.flood, row.cyclone, row.drought, row.tsunami].map(v => Number(v) || 0);
    const mean  = parts.reduce((a, b) => a + b, 0) / parts.length;
    map.set(iso2, mean * 10);
  }
  return map;
}

/** INFORM earthquake hazard (0–10) → Map<iso2, 0–100> */
function informEarthquakeMap(informData) {
  const map = new Map();
  for (const row of informData) {
    const iso2 = iso3to2(row.iso3);
    if (!iso2) continue;
    map.set(iso2, (Number(row.earthquake) || 0) * 10);
  }
  return map;
}

/** a·structural + b·events, union of keys, missing side = 0 */
function blendMaps(structMap, wStruct, eventMap, wEvent) {
  const out = new Map();
  for (const k of new Set([...structMap.keys(), ...eventMap.keys()])) {
    const v = wStruct * (structMap.get(k) || 0) + wEvent * (eventMap.get(k) || 0);
    out.set(k, Math.min(100, v));
  }
  return out;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

async function runWeeklyUpdate() {
  console.log('[cron] ══════════════════════════════════════════');
  console.log('[cron] Starting weekly safety data update');
  console.log('[cron] ══════════════════════════════════════════');

  const today = new Date().toISOString().split('T')[0];

  // ── Step 1: Fetch all sources ─────────────────────────────────────────────
  console.log('[cron] Step 1/5 — Fetching raw data from all sources…');

  const db = getDb();

  // Country name → iso2 lookup for sources that only give names (UCDP, WHO DON).
  // Built first so the conflict fetch can use it.
  const nameToIso2 = new Map();
  try {
    const { rows } = await db.query('SELECT code, name FROM countries');
    for (const r of rows) nameToIso2.set(r.name.toLowerCase(), r.code);
  } catch (err) {
    console.error('[cron] ⚠️  countries lookup failed:', err.message);
  }
  const resolveName = (name) => nameToIso2.get(String(name || '').toLowerCase().trim()) || null;

  // Conflict: UCDP GED (public CSV, always reachable) → ACLED (Cloudflare-
  // challenged from datacenter IPs, kept as optional fallback) → carry forward.
  async function fetchConflict() {
    try {
      const m = await fetchUcdpConflict(resolveName);
      if (m.size) return { source: 'UCDP', map: m };
      throw new Error('UCDP returned no countries');
    } catch (err) {
      console.error('[cron] ⚠️  UCDP failed:', err.message);
    }
    if (process.env.ACLED_EMAIL && process.env.ACLED_PASSWORD) {
      try {
        const m = await fetchAcledConflict(2020);
        if (m.size) return { source: 'ACLED', map: m };
      } catch (err) {
        console.error('[cron] ⚠️  ACLED failed:', err.message);
      }
    }
    throw new Error('no conflict source available');
  }

  // Sources that don't depend on each other run in parallel
  const [
    informData,
    conflictRes,
    foodRaw,
    usgsRaw,
    reliefDisastersRaw,
    reliefEpisRaw,
  ] = await Promise.allSettled([
    fetchInformRisk(),
    fetchConflict(),
    fetchFoodData(),
    fetchUsgsSeismicRisk(),
    fetchReliefwebDisasters(),
    fetchReliefwebEpidemics(),
  ]);

  // Helper to unwrap settled results with fallback; remembers what failed
  const failed = new Set();
  const unwrap = (result, name, fallback) => {
    if (result.status === 'fulfilled') return result.value;
    failed.add(name);
    console.error(`[cron] ⚠️  ${name} failed:`, result.reason?.message);
    return fallback;
  };

  const inform         = unwrap(informData,        'INFORM',          []);
  const conflictSrc    = unwrap(conflictRes,        'Conflict',        { source: null, map: new Map() });
  const food           = unwrap(foodRaw,            'WorldBank',       []);
  const usgs           = unwrap(usgsRaw,            'USGS',            []);
  const reliefDisaster = unwrap(reliefDisastersRaw, 'ReliefWeb',       new Map());
  const reliefEpis     = unwrap(reliefEpisRaw,      'ReliefWeb-Epi',   new Map());
  const acled          = conflictSrc.map;
  if (conflictSrc.source) console.log(`[cron] Conflict source: ${conflictSrc.source} (${acled.size} countries)`);

  // Nothing meaningful to compute without both structural (INFORM) and
  // conflict data — abort rather than write a row of zeros.
  if (failed.has('INFORM') && failed.has('Conflict')) {
    throw new Error('Both INFORM and conflict sources failed — aborting update, DB left untouched');
  }

  // Previous values per country: when a dimension's primary source failed,
  // carry the last known value forward instead of writing 0 ("missing ≠ safe").
  const prev = new Map();
  try {
    const { rows } = await db.query(
      'SELECT code, conflict, disaster, food, seismic, pandemic FROM latest_risks'
    );
    for (const r of rows) prev.set(r.code, r);
  } catch (err) {
    console.error('[cron] ⚠️  latest_risks lookup failed:', err.message);
  }
  const carry = {
    conflict: failed.has('Conflict'),
    food:     failed.has('WorldBank'),
    disaster: failed.has('INFORM'),
    seismic:  failed.has('INFORM'),
    pandemic: failed.has('INFORM'),
  };
  for (const [dim, on] of Object.entries(carry)) {
    if (on) console.warn(`[cron] ⚠️  ${dim}: primary source failed → carrying previous values forward`);
  }

  // ── Step 2: Build per-dimension Maps<iso2, rawValue> ─────────────────────
  console.log('[cron] Step 2/5 — Building dimension maps…');

  // Add INFORM names to the resolver (for WHO DON titles)
  for (const row of inform) {
    const iso2 = iso3to2(row.iso3);
    if (iso2 && row.country) nameToIso2.set(String(row.country).toLowerCase(), iso2);
  }

  // Conflict: UCDP GED (or ACLED fallback) — decay-weighted fatalities
  const conflictRaw = acled;

  // Disaster: INFORM flood/cyclone/drought/tsunami (structural, absolute 0–100)
  //         + ReliefWeb ongoing disasters (events, min-max normalised)
  const disasterStruct = informNonSeismicMap(inform);
  const disasterEvents = normalizeMapValues(reliefDisaster);

  // Food: World Bank undernourishment
  const foodRaw2 = foodToIso2Map(food);

  // Seismic: INFORM earthquake hazard (structural) + USGS last-30-days log energy
  const seismicStruct = informEarthquakeMap(inform);
  const seismicEvents = normalizeMapValues(usgsToIso2Map(usgs));

  // Pandemic: INFORM epidemic + WHO DON + ReliefWeb epidemics
  // (whoParser combines all three sources internally)
  const pandemicRaw = await fetchPandemicRisk(inform, reliefEpis, nameToIso2).catch(err => {
    console.error('[cron] ⚠️  WHO pandemic fetch failed:', err.message);
    return new Map();
  });

  // ── Step 3: Normalize each dimension to 0–100 ────────────────────────────
  console.log('[cron] Step 3/5 — Normalizing dimensions…');

  const conflict = normalizeMapValues(conflictRaw);
  const disaster = blendMaps(disasterStruct, DISASTER_STRUCT_W, disasterEvents, DISASTER_EVENT_W);
  const foodN    = normalizeMapValues(foodRaw2);
  const seismic  = blendMaps(seismicStruct, SEISMIC_STRUCT_W, seismicEvents, SEISMIC_EVENT_W);
  const pandemic = pandemicRaw; // already 0–100 from whoParser

  // ── Step 4: Collect all countries and compute scores ─────────────────────
  console.log('[cron] Step 4/5 — Computing composite scores…');

  // Union of all known countries across all dimensions
  const allCodes = new Set([
    ...conflict.keys(),
    ...disaster.keys(),
    ...foodN.keys(),
    ...seismic.keys(),
    ...pandemic.keys(),
    ...prev.keys(),
  ]);

  console.log(`[cron] Countries with data: ${allCodes.size}`);

  const rows = [];
  for (const iso2 of allCodes) {
    const old = prev.get(iso2) || {};
    const pick = (dim, map) =>
      carry[dim] ? (Number(old[dim]) || 0) : (map.get(iso2) || 0);

    const c = pick('conflict', conflict);
    const d = pick('disaster', disaster);
    const f = pick('food',     foodN);
    const s = pick('seismic',  seismic);
    const p = pick('pandemic', pandemic);

    const dims  = { conflict: c, disaster: d, food: f, seismic: s, pandemic: p };
    const score = compositeScore(dims); // default weights, same formula as API

    rows.push({
      code:     iso2,
      conflict: Math.round(c * 100) / 100,
      disaster: Math.round(d * 100) / 100,
      food:     Math.round(f * 100) / 100,
      seismic:  Math.round(s * 100) / 100,
      pandemic: Math.round(p * 100) / 100,
      score:    Math.round(score * 100) / 100,
    });
  }

  // ── Step 5: Upsert into DB + flush cache ─────────────────────────────────
  console.log(`[cron] Step 5/5 — Upserting ${rows.length} rows into DB…`);

  let upserted = 0;
  let skipped  = 0;

  for (const r of rows) {
    try {
      await db.query(
        `INSERT INTO risks
           (country_code, measured_at, conflict, disaster, food, seismic, pandemic, score, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'weekly-cron')
         ON CONFLICT (country_code, measured_at)
         DO UPDATE SET
           conflict = EXCLUDED.conflict,
           disaster = EXCLUDED.disaster,
           food     = EXCLUDED.food,
           seismic  = EXCLUDED.seismic,
           pandemic = EXCLUDED.pandemic,
           score    = EXCLUDED.score,
           source   = EXCLUDED.source`,
        [r.code, today, r.conflict, r.disaster, r.food, r.seismic, r.pandemic, r.score]
      );
      upserted++;
    } catch (err) {
      // Skip countries not in countries table (e.g. territories)
      if (err.code === '23503') { skipped++; continue; }
      console.error(`[cron] DB error for ${r.code}:`, err.message);
    }
  }

  console.log(`[cron] Upserted: ${upserted}, skipped (no country row): ${skipped}`);

  // Flush cache so map/top10 serve fresh data
  await Promise.allSettled([
    cacheService.del('map:all:v3'),
    ...[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(n => cacheService.del(`top10:${n}`)),
  ]);

  console.log('[cron] Cache flushed ✅');
  console.log('[cron] Weekly update complete ✅');
  console.log('[cron] ══════════════════════════════════════════');
}

// ── Schedule: every Monday at 06:00 UTC ──────────────────────────────────────
cron.schedule('0 6 * * 1', () => {
  runWeeklyUpdate().catch(err => {
    console.error('[cron] Weekly update crashed:', err);
  });
});

// Export for manual trigger via /api/admin/run-update (if needed)
module.exports = { runWeeklyUpdate };
