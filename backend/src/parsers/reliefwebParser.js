'use strict';
/**
 * ReliefWeb Disasters parser
 *
 * Fetches ongoing/alert disasters from the ReliefWeb API (no auth required),
 * applies severity weights and exponential time decay, then returns a
 * Map<iso2, rawScore> for all affected countries.
 *
 * Half-life: 1 year  →  λ = ln(2) / 365
 */

const https    = require('https');
const iso3to2  = require('../parsers/iso3to2');

// appname must be pre-approved: https://apidoc.reliefweb.int/parameters#appname
// Register via Google Form (~1 business day), then set RELIEFWEB_APPNAME in .env
function getApiUrl() {
  const appname = process.env.RELIEFWEB_APPNAME;
  if (!appname) throw new Error('RELIEFWEB_APPNAME is not set in .env. Register at https://apidoc.reliefweb.int/parameters#appname');
  return `https://api.reliefweb.int/v2/disasters?appname=${encodeURIComponent(appname)}`;
}

// Severity weight by disaster type name (lower-cased substring match)
// NOTE: 'epidemic' intentionally excluded — epidemic events are collected
// separately via fetchReliefwebEpidemics() and fed into the pandemic score,
// not the disaster score, to avoid double-counting.
const TYPE_WEIGHTS = [
  { match: 'tsunami',    weight: 2.0 },
  { match: 'earthquake', weight: 1.5 },
  { match: 'cyclone',    weight: 1.4 },
  { match: 'typhoon',    weight: 1.4 },
  { match: 'hurricane',  weight: 1.4 },
  { match: 'volcano',    weight: 1.2 },
  { match: 'flood',      weight: 1.0 },
  { match: 'storm',      weight: 1.0 },
  { match: 'landslide',  weight: 0.9 },
  { match: 'drought',    weight: 0.8 },
  { match: 'fire',       weight: 0.7 },
];
const DEFAULT_WEIGHT = 0.8;

const HALF_LIFE_DAYS = 365;          // 1-year half-life
const LAMBDA         = Math.LN2 / HALF_LIFE_DAYS;

function getTypeWeight(types) {
  if (!Array.isArray(types)) return DEFAULT_WEIGHT;
  for (const t of types) {
    const name = (t.name || '').toLowerCase();
    for (const tw of TYPE_WEIGHTS) {
      if (name.includes(tw.match)) return tw.weight;
    }
  }
  return DEFAULT_WEIGHT;
}

function timeDecay(createdDateStr) {
  const created  = new Date(createdDateStr);
  const now      = new Date();
  const ageDays  = Math.max(0, (now - created) / 86400000);
  return Math.exp(-LAMBDA * ageDays);
}

function postRequest(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent':     'GlobalSafetyIndex/1.0',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`ReliefWeb API error ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse ReliefWeb response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function fetchPage(offset) {
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const fromDate = threeYearsAgo.toISOString().replace(/\.\d{3}Z$/, '+00:00');

  const body = {
    filter: {
      operator: 'AND',
      conditions: [
        {
          field:    'status',
          value:    ['ongoing', 'alert'],
          operator: 'OR',
        },
        {
          field: 'date.created',
          value: { from: fromDate },
        },
      ],
    },
    fields: {
      include: ['name', 'country', 'type', 'date', 'status', 'glide'],
    },
    limit:  1000,
    offset: offset,
  };

  return postRequest(getApiUrl(), body);
}

/**
 * Fetch all ongoing/alert disasters from the last 3 years via ReliefWeb API,
 * compute a weighted + time-decayed score for each ISO2 country code.
 *
 * @returns {Promise<Map<string, number>>}  Map<iso2, rawScore>
 */
async function fetchReliefwebDisasters() {
  const scores = new Map();   // iso2 → cumulative raw score
  let offset  = 0;
  let total   = null;
  let fetched = 0;

  console.log('[ReliefWeb] Fetching disaster data…');

  do {
    const json = await fetchPage(offset);

    if (total === null) {
      total = json.totalCount || (json.data ? json.data.length : 0);
      console.log(`[ReliefWeb] Total disasters reported: ${total}`);
    }

    const items = json.data || [];
    if (!items.length) break;

    for (const item of items) {
      const fields  = item.fields || {};
      const types   = fields.type    || [];
      const countries = fields.country || [];
      const created = (fields.date && fields.date.created) ? fields.date.created : null;

      const weight  = getTypeWeight(types);
      const decay   = created ? timeDecay(created) : 0.5;
      const contrib = weight * decay;

      for (const c of countries) {
        // ReliefWeb provides iso3 in the country object
        const iso3 = c.iso3 || null;
        const iso2 = iso3 ? iso3to2(iso3) : null;
        if (!iso2) continue;

        scores.set(iso2, (scores.get(iso2) || 0) + contrib);
      }
    }

    fetched += items.length;
    offset  += items.length;
  } while (fetched < total);

  console.log(`[ReliefWeb] Scored ${scores.size} countries from ${fetched} disasters`);
  return scores;
}

/**
 * Fetch CURRENT epidemic/disease outbreak events from ReliefWeb.
 * Only 'ongoing' status within the last 6 months — we want truly active
 * outbreaks, not resolved historical events that would inflate the score.
 *
 * Half-life: 90 days (epidemics resolve faster than conflicts or disasters).
 * Severity weights by disease name (hemorrhagic fevers > respiratory > other).
 *
 * @returns {Promise<Map<string, number>>}  Map<iso2, rawScore>
 */

// Epidemic half-life is much shorter than for disasters
const EPI_HALF_LIFE = 90;
const EPI_LAMBDA    = Math.LN2 / EPI_HALF_LIFE;

function epiTimeDecay(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return 0.3;
  const ageDays = Math.max(0, (Date.now() - d) / 86400000);
  return Math.exp(-EPI_LAMBDA * ageDays);
}

// Severity multiplier by disease name (case-insensitive substring)
const EPI_SEVERITY = [
  { match: 'ebola',         weight: 3.0 },
  { match: 'marburg',       weight: 3.0 },
  { match: 'hemorrhagic',   weight: 2.5 },
  { match: 'plague',        weight: 2.5 },
  { match: 'mpox',          weight: 2.0 },
  { match: 'monkeypox',     weight: 2.0 },
  { match: 'cholera',       weight: 1.8 },
  { match: 'meningitis',    weight: 1.5 },
  { match: 'yellow fever',  weight: 1.5 },
  { match: 'dengue',        weight: 1.3 },
  { match: 'influenza',     weight: 1.3 },
  { match: 'covid',         weight: 1.2 },
  { match: 'measles',       weight: 1.1 },
];
const EPI_DEFAULT_WEIGHT = 1.0;

function epiSeverity(name) {
  const lower = (name || '').toLowerCase();
  for (const s of EPI_SEVERITY) {
    if (lower.includes(s.match)) return s.weight;
  }
  return EPI_DEFAULT_WEIGHT;
}

async function fetchReliefwebEpidemics() {
  const scores = new Map();
  let offset = 0;
  let total  = null;
  let fetched = 0;

  // Only look at the last 6 months — resolved outbreaks should not affect score
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const fromDate = sixMonthsAgo.toISOString().replace(/\.\d{3}Z$/, '+00:00');

  console.log('[ReliefWeb] Fetching CURRENT epidemic events (ongoing, last 6 months)…');

  do {
    const body = {
      filter: {
        operator: 'AND',
        conditions: [
          { field: 'type.name', value: 'Epidemic' },
          // Only 'ongoing' — 'alert' may refer to resolved or preparedness events
          { field: 'status', value: 'ongoing' },
          { field: 'date.created', value: { from: fromDate } },
        ],
      },
      fields: { include: ['name', 'country', 'date', 'status'] },
      sort:   ['date.created:desc'],
      limit:  1000,
      offset,
    };

    const json  = await postRequest(getApiUrl(), body);
    if (total === null) {
      total = json.totalCount || 0;
      console.log(`[ReliefWeb] Current epidemic events found: ${total}`);
    }

    const items = json.data || [];
    if (!items.length) break;

    for (const item of items) {
      const fields    = item.fields || {};
      const name      = fields.name  || '';
      const countries = fields.country || [];
      const created   = fields.date?.created || null;

      const decay    = created ? epiTimeDecay(created) : 0.3;
      const severity = epiSeverity(name);
      const contrib  = severity * decay;

      for (const c of countries) {
        const iso2 = c.iso3 ? iso3to2(c.iso3) : null;
        if (!iso2) continue;
        scores.set(iso2, (scores.get(iso2) || 0) + contrib);
      }
    }

    fetched += items.length;
    offset  += items.length;
  } while (fetched < total);

  console.log(`[ReliefWeb] Active epidemic score: ${scores.size} countries affected`);
  return scores;
}

module.exports = { fetchReliefwebDisasters, fetchReliefwebEpidemics };
