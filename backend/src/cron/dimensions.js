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
// The floor is 0.2 rather than 0.5 so the safest group stays distinguishable:
// at 0.5 Japan, Singapore, Norway, Switzerland and Italy all collapsed to 0.
const CRIME_ANCHORS = [
  [0.2, 0], [0.5, 10], [1, 20], [3, 40], [6, 53], [12, 68], [25, 84], [50, 100],
];

// Road traffic deaths per 100k per year (WHO). The spread is narrow enough
// for linear anchors: best countries ≈2, world median ≈16, worst ≈45.
const ROAD_ANCHORS = [[2, 0], [5, 20], [10, 40], [18, 60], [27, 80], [45, 100]];

// Moderate or severe food insecurity, % of population (FAO FIES).
const FOOD_FIES_ANCHORS = [[2, 0], [5, 15], [10, 30], [25, 55], [50, 80], [80, 100]];

// Prevalence of undernourishment, % — fallback scale, FAO severity bands
// (<2.5 % very low, 5–15 % moderate, 15–25 % high, >25 % very high).
// Censored at 2.5 %, so it cannot separate countries below that.
const FOOD_DEFC_ANCHORS = [[2.5, 0], [5, 20], [15, 50], [25, 75], [40, 100]];

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
  // Keyed on population, not on the conflict data: UCDP covers the whole world,
  // so a country absent from it recorded no organized-violence deaths. That is
  // a measured zero, not missing data. Countries with no population figure are
  // the genuinely unknown ones and are left out entirely.
  for (const [iso2, pop] of population) {
    if (!pop || pop <= 0) continue;
    const total = weighted.get(iso2) || 0;
    out.set(iso2, ((total / CONFLICT_DECAY_WINDOW) / pop) * 100000);
  }
  return out;
}

/**
 * a·structural + b·events.
 *
 * Keyed on the structural index, which is the backbone of the dimension: an
 * event feed says nothing about a country it does not mention (no ongoing
 * disaster this month is a zero, not a hazard assessment), whereas a country
 * missing from INFORM has no hazard assessment at all and must stay unknown.
 * A structural entry with no matching events counts the event side as 0.
 */
function blendMaps(structMap, wStruct, eventMap, wEvent) {
  const out = new Map();
  for (const [k, structVal] of structMap) {
    const v = wStruct * (structVal || 0) + wEvent * (eventMap.get(k) || 0);
    out.set(k, Math.min(100, v));
  }
  return out;
}

/**
 * Food dimension: FIES where it exists, undernourishment elsewhere.
 *
 * FIES measures how many people cannot reliably access enough food and spans
 * the whole range (Germany 4 %, Norway 8 %, Yemen 73 %). Undernourishment is
 * censored at 2.5 %, which collapses every developed country onto one value,
 * but it covers ~35 countries FIES misses, including India and Sudan.
 *
 * The two scales are not identical, so a country scored via the fallback is
 * only roughly comparable to one scored via FIES; `source` says which was used.
 */
function foodMap(fies, undernourishment, scaleFn) {
  const out = new Map();
  const via = new Map();
  for (const [iso2, v] of fies) {
    out.set(iso2, scaleFn(v, FOOD_FIES_ANCHORS));
    via.set(iso2, 'fies');
  }
  for (const [iso2, v] of undernourishment) {
    if (out.has(iso2)) continue;
    out.set(iso2, scaleFn(v, FOOD_DEFC_ANCHORS));
    via.set(iso2, 'undernourishment');
  }
  return { map: out, via };
}

module.exports = {
  DISASTER_STRUCT_W, DISASTER_EVENT_W, SEISMIC_STRUCT_W, SEISMIC_EVENT_W,
  CONFLICT_HALF_LIFE_YEARS, CONFLICT_DECAY_WINDOW,
  CONFLICT_ANCHORS, CRIME_ANCHORS, ROAD_ANCHORS,
  FOOD_FIES_ANCHORS, FOOD_DEFC_ANCHORS,
  DISASTER_EVENT_ANCHORS, SEISMIC_EVENT_ANCHORS,
  wbToIso2Map, conflictRateMap, blendMaps, foodMap,
};
