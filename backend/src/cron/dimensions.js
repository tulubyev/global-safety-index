'use strict';
/**
 * Pure helpers that turn raw source data into dimension values.
 *
 * Kept out of weeklyUpdate.js because requiring that module schedules the
 * cron job and opens a database pool as a side effect — these functions are
 * pure and must stay importable on their own, by tests and by anything else.
 */

const iso3to2 = require('../parsers/iso3to2');

// Sub-weights inside a dimension (structural index vs. recent events)
const DISASTER_STRUCT_W = 0.70;   // INFORM flood/cyclone/drought/tsunami
const DISASTER_EVENT_W  = 0.30;   // ReliefWeb ongoing disasters
const SEISMIC_STRUCT_W  = 0.80;   // INFORM earthquake hazard
const SEISMIC_EVENT_W   = 0.20;   // USGS M4.5+ last 30 days (log energy)

// ── Absolute scales ──────────────────────────────────────────────────────────
// Every dimension maps a real quantity to 0–100 through fixed anchors, never
// min-max: a score must mean the same thing regardless of which other
// countries are in the dataset, and must stay comparable across runs.

// Must match the half-life used by the conflict parsers. The decay-weighted
// sum of a steady process converges to rate × H/ln2, so dividing by that
// turns the weighted total back into an annual rate.
const CONFLICT_HALF_LIFE_YEARS = 2;
const CONFLICT_DECAY_WINDOW    = CONFLICT_HALF_LIFE_YEARS / Math.LN2;  // ≈ 2.89 years

// Conflict deaths per 100k population per year (log scale: each order of
// magnitude is a step). 1/100k/yr ≈ a country in sustained low-level conflict,
// 100/100k/yr ≈ full-scale war.
const CONFLICT_ANCHORS = [[0.01, 0], [0.1, 25], [1, 50], [10, 75], [100, 100]];

// Intentional homicides per 100k per year (UNODC via World Bank). Western
// Europe sits near 1, the global average near 6, the worst countries near 50.
const CRIME_ANCHORS = [[0.5, 0], [1, 15], [3, 35], [6, 50], [12, 70], [25, 85], [50, 100]];

// Prevalence of undernourishment, % of population — FAO severity bands
// (<2.5 % very low, 5–15 % moderate, 15–25 % high, >25 % very high).
const FOOD_ANCHORS = [[2.5, 0], [5, 20], [15, 50], [25, 75], [40, 100]];

// ReliefWeb: Σ (type weight × time decay) over ongoing disasters.
// ≈1 means one fresh average-severity disaster.
const DISASTER_EVENT_ANCHORS = [[0.3, 0], [1, 30], [3, 60], [10, 100]];

// USGS: log10 of summed seismic energy over 30 days. A single M4.5 is ≈6.75,
// a single M7.5 ≈11.25, so the anchors are already in log space.
const SEISMIC_EVENT_ANCHORS = [[6.5, 0], [8, 30], [9.5, 60], [11, 100]];

/** Convert a World Bank indicator array → Map<iso2, value> */
function wbToIso2Map(rows) {
  const map = new Map();
  for (const { code3, value } of rows) {
    const iso2 = iso3to2(code3);
    if (!iso2) continue;
    map.set(iso2, value);
  }
  return map;
}

/**
 * Decay-weighted fatalities → deaths per 100k population per year.
 *
 * Without the population denominator a large country looks more dangerous
 * than a small one at the same level of violence, purely because more people
 * live there. Countries with no population figure are dropped rather than
 * scored on an absolute count.
 */
function conflictRateMap(weighted, population) {
  const out = new Map();
  let noPop = 0;
  for (const [iso2, total] of weighted) {
    const pop = population.get(iso2);
    if (!pop || pop <= 0) { noPop++; continue; }
    out.set(iso2, ((total / CONFLICT_DECAY_WINDOW) / pop) * 100000);
  }
  if (noPop) console.warn(`[cron] ⚠️  conflict: ${noPop} countries dropped (no population data)`);
  return out;
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

module.exports = {
  DISASTER_STRUCT_W, DISASTER_EVENT_W, SEISMIC_STRUCT_W, SEISMIC_EVENT_W,
  CONFLICT_HALF_LIFE_YEARS, CONFLICT_DECAY_WINDOW,
  CONFLICT_ANCHORS, CRIME_ANCHORS, FOOD_ANCHORS,
  DISASTER_EVENT_ANCHORS, SEISMIC_EVENT_ANCHORS,
  wbToIso2Map, conflictRateMap, blendMaps,
};
