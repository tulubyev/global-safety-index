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
 *  road      — WHO road traffic deaths per 100k (via World Bank)
 *  disaster  — INFORM flood/cyclone/drought/tsunami (70%) + ReliefWeb ongoing disasters (30%)
 *  food      — FAO food insecurity (FIES) %, undernourishment % as fallback
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
const { fetchFoodInsecurity,
        fetchUndernourishment,
        fetchPopulation,
        fetchHomicideRate,
        fetchRoadDeaths }           = require('../parsers/worldBankParser');
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
  CONFLICT_ANCHORS, CRIME_ANCHORS, ROAD_ANCHORS,
  DISASTER_EVENT_ANCHORS, SEISMIC_EVENT_ANCHORS,
  wbToIso2Map, conflictRateMap, blendMaps, foodMap,
} = require('./dimensions');
const { getDb }                     = require('../services/dbService');
const cacheService                  = require('../services/cacheService');
const { compositeScore, coverage,
        DIMENSIONS }                = require('../services/scoreService');

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
    fiesRaw,
    undernRaw,
    popRaw,
    homicideRaw,
    roadRaw,
    usgsRaw,
    reliefDisastersRaw,
    reliefEpisRaw,
  ] = await Promise.allSettled([
    fetchInformRisk(),
    fetchConflict(),
    fetchFoodInsecurity(),
    fetchUndernourishment(),
    fetchPopulation(),
    fetchHomicideRate(),
    fetchRoadDeaths(),
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
  const fiesRows       = unwrap(fiesRaw,            'FoodInsecurity',  []);
  const undernRows     = unwrap(undernRaw,          'Undernourishment',[]);
  const popRows        = unwrap(popRaw,             'Population',      []);
  const homicideRows   = unwrap(homicideRaw,        'Homicide',        []);
  const roadRows       = unwrap(roadRaw,            'RoadDeaths',      []);
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
      `SELECT code, ${DIMENSIONS.join(', ')} FROM latest_risks`
    );
    for (const r of rows) prev.set(r.code, r);
  } catch (err) {
    console.error('[cron] ⚠️  latest_risks lookup failed:', err.message);
  }
  const carry = {
    conflict: failed.has('Conflict') || failed.has('Population'),
    crime:    failed.has('Homicide'),
    // Food survives on either source; only both failing loses the dimension
    food:     failed.has('FoodInsecurity') && failed.has('Undernourishment'),
    road:     failed.has('RoadDeaths'),
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

  // Food: FIES where published, undernourishment where it is not
  const { map: foodScaled, via: foodVia } = foodMap(
    wbToIso2Map(fiesRows), wbToIso2Map(undernRows), anchoredScale);
  const viaFallback = [...foodVia.values()].filter(v => v === 'undernourishment').length;
  console.log(`[cron] Food: ${foodVia.size} countries `
            + `(${foodVia.size - viaFallback} via FIES, ${viaFallback} via undernourishment)`);

  // Crime: UNODC intentional homicide rate, already per 100k per year
  const homicideRate = wbToIso2Map(homicideRows);

  // Road: WHO road traffic deaths, already per 100k per year
  const roadRate = wbToIso2Map(roadRows);

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
  const road     = scaleMap(roadRate, v => anchoredScale(v, ROAD_ANCHORS));
  const foodN    = scaleMap(foodScaled, v => v);   // foodMap already scaled
  const seismic  = blendMaps(seismicStruct, SEISMIC_STRUCT_W, seismicEvents, SEISMIC_EVENT_W);
  const pandemic = pandemicRaw; // already 0–100 from whoParser

  // ── Step 4: Collect all countries and compute scores ─────────────────────
  console.log('[cron] Step 4/5 — Computing composite scores…');

  // Union of all known countries across all dimensions
  const allCodes = new Set([
    ...conflict.keys(),
    ...crime.keys(),
    ...road.keys(),
    ...disaster.keys(),
    ...foodN.keys(),
    ...seismic.keys(),
    ...pandemic.keys(),
    ...prev.keys(),
  ]);

  console.log(`[cron] Countries with data: ${allCodes.size}`);

  const round2 = v => (v === null ? null : Math.round(v * 100) / 100);

  const rows = [];
  for (const iso2 of allCodes) {
    const old = prev.get(iso2) || {};
    // null = no data for this dimension. Distinct from a measured 0, which a
    // country legitimately gets when e.g. it recorded no conflict deaths.
    const pick = (dim, map) => {
      const v = carry[dim] ? old[dim] : (map.has(iso2) ? map.get(iso2) : null);
      return v === null || v === undefined ? null : Number(v);
    };

    const c = pick('conflict', conflict);
    const cr= pick('crime',    crime);
    const rd= pick('road',     road);
    const d = pick('disaster', disaster);
    const f = pick('food',     foodN);
    const s = pick('seismic',  seismic);
    const p = pick('pandemic', pandemic);

    const dims  = { conflict: c, crime: cr, road: rd, disaster: d, food: f, seismic: s, pandemic: p };
    const score = compositeScore(dims); // default weights, same formula as API

    rows.push({
      code:     iso2,
      conflict: round2(c),
      crime:    round2(cr),
      road:     round2(rd),
      disaster: round2(d),
      food:     round2(f),
      seismic:  round2(s),
      pandemic: round2(p),
      score:    Math.round(score * 100) / 100,
      coverage: coverage(dims),
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
           (country_code, measured_at, ${DIMENSIONS.join(', ')}, score, source)
         VALUES ($1, $2, ${DIMENSIONS.map((_, i) => `$${i + 3}`).join(', ')}, $${DIMENSIONS.length + 3}, 'weekly-cron')
         ON CONFLICT (country_code, measured_at)
         DO UPDATE SET
           ${DIMENSIONS.map(d => `${d} = EXCLUDED.${d}`).join(',\n           ')},
           score    = EXCLUDED.score,
           source   = EXCLUDED.source`,
        [r.code, today, ...DIMENSIONS.map(d => r[d]), r.score]
      );
      upserted++;
    } catch (err) {
      // Skip countries not in countries table (e.g. territories)
      if (err.code === '23503') { skipped++; continue; }
      console.error(`[cron] DB error for ${r.code}:`, err.message);
    }
  }

  console.log(`[cron] Upserted: ${upserted}, skipped (no country row): ${skipped}`);

  const full = rows.filter(r => r.coverage === DIMENSIONS.length).length;
  const thin = rows.filter(r => r.coverage < 3).length;
  console.log(`[cron] Coverage: ${full} countries with all ${DIMENSIONS.length} dimensions, `
            + `${thin} with fewer than 3`);

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
