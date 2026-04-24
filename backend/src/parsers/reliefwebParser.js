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

const RELIEFWEB_URL = 'https://api.reliefweb.int/v2/disasters?appname=global-safety-index';

// Severity weight by disaster type name (lower-cased substring match)
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
  { match: 'epidemic',   weight: 0.6 },
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

  return postRequest(RELIEFWEB_URL, body);
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

module.exports = { fetchReliefwebDisasters };
