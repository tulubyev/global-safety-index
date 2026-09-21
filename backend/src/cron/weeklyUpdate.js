'use strict';
/**
 * Weekly data pipeline — runs every Monday 06:00 UTC
 *
 * Flow:
 *  1. Fetch raw data from all sources in parallel where possible
 *  2. Map each dimension onto an absolute 0–100 scale (fixed anchors, not min-max)
 *  3. Compute composite score using default weights
 *  4. Upsert into `risks` table (one row per country per date)
 *  5. Flush all relevant cache keys
 *
 * Dimensions and their sources:
 *  conflict  — UCDP GED + candidate events, deaths per 100k/yr (2-yr half-life); ACLED fallback
 *  crime     — UNODC intentional homicide rate per 100k (via World Bank)
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
const { fetchInformRisk,
        informNonSeismicMap,
        informEarthquakeMap }       = require('../parsers/informParser');
const { fetchFoodData,
        fetchPopulation,
        fetchHomicideRate }         = require('../parsers/worldBankParser');
const { fetchUsgsSeismicRisk,
        usgsToIso2Map }             = require('../parsers/usgsParser');
const { fetchReliefwebDisasters,
        fetchReliefwebEpidemics }   = require('../parsers/reliefwebParser');
const { fetchPandemicRisk }         = require('../parsers/whoParser');
const iso3to2                       = require('../parsers/iso3to2');
const { logAnchoredScale,
        anchoredScale, scaleMap }   = require('../parsers/scale');
const {
  DISASTER_STRUCT_W, DISASTER_EVENT_W, SEISMIC_STRUCT_W, SEISMIC_EVENT_W,
  CONFLICT_ANCHORS, CRIME_ANCHORS, FOOD_ANCHORS,
  DISASTER_EVENT_ANCHORS, SEISMIC_EVENT_ANCHORS,
  wbToIso2Map, conflictRateMap, blendMaps,
} = require('./dimensions');
const { getDb }                     = require('../services/dbService');
const cacheService                  = require('../services/cacheService');
const { compositeScore }            = require('../services/scoreService');

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
    popRaw,
    homicideRaw,
    usgsRaw,
    reliefDisastersRaw,
    reliefEpisRaw,
  ] = await Promise.allSettled([
    fetchInformRisk(),
    fetchConflict(),
    fetchFoodData(),
    fetchPopulation(),
    fetchHomicideRate(),
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
  const popRows        = unwrap(popRaw,             'Population',      []);
  const homicideRows   = unwrap(homicideRaw,        'Homicide',        []);
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
      'SELECT code, conflict, crime, disaster, food, seismic, pandemic FROM latest_risks'
    );
    for (const r of rows) prev.set(r.code, r);
  } catch (err) {
    console.error('[cron] ⚠️  latest_risks lookup failed:', err.message);
  }
  const carry = {
    conflict: failed.has('Conflict') || failed.has('Population'),
    crime:    failed.has('Homicide'),
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

  const population = wbToIso2Map(popRows);

  // Conflict: decay-weighted fatalities → deaths per 100k/year
  const conflictRate = conflictRateMap(acled, population);

  // Disaster: INFORM flood/cyclone/drought/tsunami (structural, absolute 0–100)
  //         + ReliefWeb ongoing disasters (events)
  const disasterStruct = informNonSeismicMap(inform);
  const disasterEvents = scaleMap(reliefDisaster, v => logAnchoredScale(v, DISASTER_EVENT_ANCHORS));

  // Food: World Bank undernourishment, % of population
  const foodPct = wbToIso2Map(food);

  // Crime: UNODC intentional homicide rate, already per 100k per year
  const homicideRate = wbToIso2Map(homicideRows);

  // Seismic: INFORM earthquake hazard (structural) + USGS last-30-days log energy
  const seismicStruct = informEarthquakeMap(inform);
  const seismicEvents = scaleMap(usgsToIso2Map(usgs), v => anchoredScale(v, SEISMIC_EVENT_ANCHORS));

  // Pandemic: INFORM epidemic + WHO DON + ReliefWeb epidemics
  // (whoParser combines all three sources internally)
  const pandemicRaw = await fetchPandemicRisk(inform, reliefEpis, nameToIso2).catch(err => {
    console.error('[cron] ⚠️  WHO pandemic fetch failed:', err.message);
    return new Map();
  });

  // ── Step 3: Map each dimension onto the absolute 0–100 scale ─────────────
  console.log('[cron] Step 3/5 — Applying absolute scales…');

  const conflict = scaleMap(conflictRate, v => logAnchoredScale(v, CONFLICT_ANCHORS));
  const disaster = blendMaps(disasterStruct, DISASTER_STRUCT_W, disasterEvents, DISASTER_EVENT_W);
  const crime    = scaleMap(homicideRate, v => logAnchoredScale(v, CRIME_ANCHORS));
  const foodN    = scaleMap(foodPct, v => anchoredScale(v, FOOD_ANCHORS));
  const seismic  = blendMaps(seismicStruct, SEISMIC_STRUCT_W, seismicEvents, SEISMIC_EVENT_W);
  const pandemic = pandemicRaw; // already 0–100 from whoParser

  // ── Step 4: Collect all countries and compute scores ─────────────────────
  console.log('[cron] Step 4/5 — Computing composite scores…');

  // Union of all known countries across all dimensions
  const allCodes = new Set([
    ...conflict.keys(),
    ...crime.keys(),
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
    const cr= pick('crime',    crime);
    const d = pick('disaster', disaster);
    const f = pick('food',     foodN);
    const s = pick('seismic',  seismic);
    const p = pick('pandemic', pandemic);

    const dims  = { conflict: c, crime: cr, disaster: d, food: f, seismic: s, pandemic: p };
    const score = compositeScore(dims); // default weights, same formula as API

    rows.push({
      code:     iso2,
      conflict: Math.round(c * 100) / 100,
      crime:    Math.round(cr * 100) / 100,
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
           (country_code, measured_at, conflict, crime, disaster, food, seismic, pandemic, score, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'weekly-cron')
         ON CONFLICT (country_code, measured_at)
         DO UPDATE SET
           conflict = EXCLUDED.conflict,
           crime    = EXCLUDED.crime,
           disaster = EXCLUDED.disaster,
           food     = EXCLUDED.food,
           seismic  = EXCLUDED.seismic,
           pandemic = EXCLUDED.pandemic,
           score    = EXCLUDED.score,
           source   = EXCLUDED.source`,
        [r.code, today, r.conflict, r.crime, r.disaster, r.food, r.seismic, r.pandemic, r.score]
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
