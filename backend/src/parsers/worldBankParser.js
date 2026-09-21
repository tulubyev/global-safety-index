'use strict';
/**
 * World Bank Open Data — public API, no token required.
 *
 * Indicators used:
 *   SN.ITK.MSFI.ZS  moderate or severe food insecurity, % (FAO FIES, SDG 2.1.2)
 *   SN.ITK.DEFC.ZS  prevalence of undernourishment, % (fallback for MSFI)
 *   SP.POP.TOTL     total population
 *   VC.IHR.PSRC.P5  intentional homicides per 100,000 people (UNODC data)
 *   SH.STA.TRAF.P5  road traffic deaths per 100,000 people (WHO GHO data)
 */

const https = require('https');

const INDICATORS = {
  foodInsecurity:   'SN.ITK.MSFI.ZS',
  undernourishment: 'SN.ITK.DEFC.ZS',
  population:       'SP.POP.TOTL',
  homicide:         'VC.IHR.PSRC.P5',
  roadDeaths:       'SH.STA.TRAF.P5',
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'WorldSafetyIndex/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`World Bank HTTP ${res.statusCode}: ${data.slice(0, 120)}`));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Bad JSON from World Bank: ${e.message}`)); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Most recent non-null value per country for an indicator.
 *
 * `mrv` asks for the last N years: several indicators (homicide especially)
 * are reported irregularly, so the latest year is often null and a window is
 * needed to find an actual figure. The first non-null year per country wins.
 *
 * @returns {Promise<Array<{code3: string, value: number, year: string}>>}
 */
async function fetchIndicator(indicator, mrv = 1) {
  const perPage = Math.max(400, 300 * mrv + 100);
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}`
            + `?format=json&mrv=${mrv}&per_page=${perPage}`;

  const json = await fetchJson(url);
  if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
    throw new Error(`Unexpected World Bank response for ${indicator}`);
  }

  // Rows come newest-first per country; keep the first one that has a value.
  const best = new Map();
  for (const entry of json[1]) {
    const code3 = entry.countryiso3code;
    const value = entry.value;
    if (!code3 || value === null || value === undefined) continue;
    const prev = best.get(code3);
    if (!prev || Number(entry.date) > Number(prev.year)) {
      best.set(code3, { code3, value: Number(value), year: entry.date });
    }
  }
  return [...best.values()];
}

/**
 * Moderate or severe food insecurity, % of population (FAO FIES).
 * Preferred over undernourishment: the latter is censored at 2.5 %, so every
 * developed country reports the same floor value and the dimension cannot
 * distinguish them. Published as a 3-year rolling average, irregularly.
 */
const fetchFoodInsecurity = () => fetchIndicator(INDICATORS.foodInsecurity, 8);

/** Prevalence of undernourishment, % — fallback where FIES is unavailable. */
const fetchUndernourishment = () => fetchIndicator(INDICATORS.undernourishment, 4);

/** Total population — denominator for per-capita rates. */
const fetchPopulation = () => fetchIndicator(INDICATORS.population, 2);

/** Intentional homicides per 100,000 (UNODC via World Bank); reported irregularly. */
const fetchHomicideRate = () => fetchIndicator(INDICATORS.homicide, 8);

/** Road traffic deaths per 100,000 (WHO GHO via World Bank). */
const fetchRoadDeaths = () => fetchIndicator(INDICATORS.roadDeaths, 8);

module.exports = {
  INDICATORS,
  fetchIndicator,
  fetchFoodInsecurity,
  fetchUndernourishment,
  fetchPopulation,
  fetchHomicideRate,
  fetchRoadDeaths,
};
