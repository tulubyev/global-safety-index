'use strict';
/**
 * UCDP conflict parser — Uppsala Conflict Data Program, Georeferenced Event Dataset
 *
 * Public CSV downloads, no token, CC BY 4.0 (citation required — see About modal):
 *   final yearly GED   https://ucdp.uu.se/downloads/ged/ged<VV>1-csv.zip
 *                      (version VV.1 covers 1989 … VV-1; e.g. 26.1 → through 2025)
 *   candidate monthly  https://ucdp.uu.se/downloads/candidateged/GEDEvent_v<VV>_0_<M>.csv
 *   candidate half-yr  https://ucdp.uu.se/downloads/candidateged/GEDEvent_v<VV>_01_<VV>_06.csv
 *
 * Strategy
 *   1. Latest final GED that exists (probe VV = current year, then VV-1).
 *   2. For every year after the final release's coverage, pull candidate
 *      monthly files (skip months not yet published), fall back to the
 *      half-year bundles if a month is missing. Events deduped by id.
 *   3. Sum `best` fatalities per country with exponential decay,
 *      half-life 2 years from date_start. Same shape as the ACLED parser:
 *      Map<iso2, weightedFatalities>.
 *
 * Country resolution: Gleditsch-Ward `country_id` → ISO2 table below, then
 * `country` name against the resolver passed in by the cron (DB names).
 */

const https    = require('https');
const fs       = require('fs');
const unzipper = require('unzipper');

const BASE          = 'https://ucdp.uu.se/downloads';
const CACHE_DIR     = '/tmp/ucdp';
const HALF_LIFE_YRS = 2;
const START_YEAR    = 2020;
const USER_AGENT    = 'WorldSafetyIndex/1.0 (+https://worldsafetyindex.org)';

// Gleditsch-Ward country number → ISO2
const GW_TO_ISO2 = {
  2:'US',20:'CA',31:'BS',40:'CU',41:'HT',42:'DO',51:'JM',52:'TT',53:'BB',54:'DM',55:'GD',
  56:'LC',57:'VC',58:'AG',60:'KN',70:'MX',80:'BZ',90:'GT',91:'HN',92:'SV',93:'NI',94:'CR',
  95:'PA',100:'CO',101:'VE',110:'GY',115:'SR',130:'EC',135:'PE',140:'BR',145:'BO',150:'PY',
  155:'CL',160:'AR',165:'UY',200:'GB',205:'IE',210:'NL',211:'BE',212:'LU',220:'FR',221:'MC',
  223:'LI',225:'CH',230:'ES',232:'AD',235:'PT',255:'DE',260:'DE',265:'DE',290:'PL',305:'AT',
  310:'HU',315:'CZ',316:'CZ',317:'SK',325:'IT',331:'SM',332:'VA',338:'MT',339:'AL',340:'RS',
  341:'ME',343:'MK',344:'HR',345:'RS',346:'BA',347:'XK',349:'SI',350:'GR',352:'CY',355:'BG',
  359:'MD',360:'RO',365:'RU',366:'EE',367:'LV',368:'LT',369:'UA',370:'BY',371:'AM',372:'GE',
  373:'AZ',375:'FI',380:'SE',385:'NO',390:'DK',395:'IS',402:'CV',403:'ST',404:'GW',411:'GQ',
  420:'GM',432:'ML',433:'SN',434:'BJ',435:'MR',436:'NE',437:'CI',438:'GN',439:'BF',450:'LR',
  451:'SL',452:'GH',461:'TG',471:'CM',475:'NG',481:'GA',482:'CF',483:'TD',484:'CG',490:'CD',
  500:'UG',501:'KE',510:'TZ',511:'TZ',516:'BI',517:'RW',520:'SO',522:'DJ',530:'ET',531:'ER',
  540:'AO',541:'MZ',551:'ZM',552:'ZW',553:'MW',560:'ZA',565:'NA',570:'LS',571:'BW',572:'SZ',
  580:'MG',581:'KM',590:'MU',591:'SC',600:'MA',615:'DZ',616:'TN',620:'LY',625:'SD',626:'SS',
  630:'IR',640:'TR',645:'IQ',651:'EG',652:'SY',660:'LB',663:'JO',666:'IL',670:'SA',678:'YE',
  679:'YE',680:'YE',690:'KW',692:'BH',694:'QA',696:'AE',698:'OM',700:'AF',701:'TM',702:'TJ',
  703:'KG',704:'UZ',705:'KZ',710:'CN',712:'MN',713:'TW',731:'KP',732:'KR',740:'JP',750:'IN',
  760:'BT',770:'PK',771:'BD',775:'MM',780:'LK',781:'MV',790:'NP',800:'TH',811:'KH',812:'LA',
  816:'VN',817:'VN',820:'MY',830:'SG',835:'BN',840:'PH',850:'ID',860:'TL',900:'AU',910:'PG',
  920:'NZ',935:'VU',940:'SB',946:'KI',947:'TV',950:'FJ',955:'TO',970:'NR',971:'MH',972:'PW',
  973:'FM',983:'WS',990:'WS',
};

// UCDP naming quirks not covered by plain DB-name matching
const NAME_ALIASES = {
  'dr congo (zaire)':               'CD',
  'yemen (north yemen)':            'YE',
  'myanmar (burma)':                'MM',
  'russia (soviet union)':          'RU',
  'cambodia (kampuchea)':           'KH',
  'madagascar (malagasy)':          'MG',
  'zimbabwe (rhodesia)':            'ZW',
  'serbia (yugoslavia)':            'RS',
  'bosnia-herzegovina':             'BA',
  'ivory coast':                    'CI',
  'kingdom of eswatini (swaziland)':'SZ',
  'united states of america':       'US',
  'vietnam (north vietnam)':        'VN',
  'north macedonia':                'MK',
  'united kingdom':                 'GB',
  'iran':                           'IR',
  'syria':                          'SY',
  'laos':                           'LA',
  'tanzania':                       'TZ',
  'moldova':                        'MD',
  'south korea':                    'KR',
  'north korea':                    'KP',
  'czech republic':                 'CZ',
};

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function request(url, { method = 'GET', redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: { 'User-Agent': USER_AGENT } }, (res) => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location && redirects > 0) {
        res.resume();
        return request(new URL(headers.location, url).href, { method, redirects: redirects - 1 })
          .then(resolve).catch(reject);
      }
      resolve(res);
    });
    req.on('error', reject);
    req.end();
  });
}

async function exists(url) {
  const res = await request(url, { method: 'HEAD' });
  res.resume();
  return res.statusCode === 200;
}

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const res = await request(url);
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`HTTP ${res.statusCode} for ${url}`);
  }
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => file.close(resolve));
    file.on('error', reject);
    res.on('error', reject);
  });
  return dest;
}

// ── Streaming CSV (RFC 4180: quoted fields may contain commas and newlines) ──

/**
 * Feed chunks into `csvRows(onRow)`; rows are emitted as arrays of strings.
 * State survives chunk boundaries, so a quoted field split across two chunks
 * is handled correctly.
 */
function csvRows(onRow) {
  let field = '', row = [], inQuotes = false, prevQuote = false;
  return {
    write(chunk) {
      const s = chunk.toString('utf8');
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inQuotes) {
          if (ch === '"') {
            if (prevQuote) { field += '"'; prevQuote = false; }
            else prevQuote = true;
          } else if (prevQuote) {
            inQuotes = false; prevQuote = false; i--; // reprocess ch outside quotes
          } else {
            field += ch;
          }
          continue;
        }
        if (ch === '"')      inQuotes = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); onRow(row); row = []; field = ''; }
        else if (ch !== '\r') field += ch;
      }
    },
    end() {
      if (field.length || row.length) { row.push(field); onRow(row); }
    },
  };
}

// ── Event aggregation ────────────────────────────────────────────────────────

function makeAggregator(resolveName) {
  const totals = new Map();
  const seen   = new Set();
  const now    = Date.now();
  let header   = null, idx = null, rows = 0, kept = 0, unmatched = new Map();

  function onRow(cols) {
    if (!header) {
      header = cols.map(h => h.trim().toLowerCase());
      idx = {
        id:      header.indexOf('id'),
        year:    header.indexOf('year'),
        gw:      header.indexOf('country_id'),
        country: header.indexOf('country'),
        date:    header.indexOf('date_start'),
        best:    header.indexOf('best'),
      };
      if (idx.best < 0 || idx.date < 0) throw new Error(`Unexpected GED header: ${header.slice(0, 10).join(',')}…`);
      return;
    }
    rows++;
    const year = Number(cols[idx.year]);
    if (!year || year < START_YEAR) return;
    const id = cols[idx.id];
    if (id && seen.has(id)) return;
    if (id) seen.add(id);

    const best = Number(cols[idx.best]) || 0;
    if (best <= 0) return;

    const gw   = Number(cols[idx.gw]);
    const name = cols[idx.country] || '';
    const iso2 = GW_TO_ISO2[gw]
      || NAME_ALIASES[name.toLowerCase().trim()]
      || (resolveName ? resolveName(name) : null);
    if (!iso2) { unmatched.set(name, (unmatched.get(name) || 0) + best); return; }

    const t = Date.parse(cols[idx.date]);
    const ageYears = isNaN(t) ? (new Date().getFullYear() - year) : (now - t) / (365.25 * 86400e3);
    const weight   = Math.exp(-Math.LN2 * Math.max(0, ageYears) / HALF_LIFE_YRS);

    totals.set(iso2, (totals.get(iso2) || 0) + best * weight);
    kept++;
  }

  return { onRow, totals, stats: () => ({ rows, kept, unmatched }) , reset() { header = null; idx = null; } };
}

async function streamCsvFile(path, agg) {
  agg.reset();
  const parser = csvRows(agg.onRow);
  await new Promise((resolve, reject) => {
    fs.createReadStream(path)
      .on('data', c => parser.write(c))
      .on('end', () => { parser.end(); resolve(); })
      .on('error', reject);
  });
}

async function streamZipCsv(path, agg) {
  agg.reset();
  await new Promise((resolve, reject) => {
    let found = false;
    fs.createReadStream(path)
      .pipe(unzipper.Parse())
      .on('entry', (entry) => {
        if (found || !entry.path.toLowerCase().endsWith('.csv')) return entry.autodrain();
        found = true;
        const parser = csvRows(agg.onRow);
        entry.on('data', c => parser.write(c));
        entry.on('end', () => parser.end());
        entry.on('error', reject);
      })
      .on('finish', () => found ? resolve() : reject(new Error('No CSV inside GED zip')))
      .on('error', reject);
  });
}

// ── Release discovery ────────────────────────────────────────────────────────

async function latestFinalRelease() {
  const yy = new Date().getFullYear() % 100;
  for (const v of [yy, yy - 1, yy - 2]) {
    const url = `${BASE}/ged/ged${v}1-csv.zip`;
    if (await exists(url)) return { version: `${v}.1`, url, coversThrough: 2000 + v - 1 };
  }
  throw new Error('No UCDP GED release found');
}

/** Candidate CSV URLs for a given year: monthly, with half-year bundles as fallback. */
async function candidateFiles(year) {
  const yy   = year % 100;
  const now  = new Date();
  const maxM = year === now.getFullYear() ? now.getMonth() + 1 : 12; // releases lag ~1 month
  const files = [];
  const missing = [];
  for (let m = 1; m <= maxM; m++) {
    const url = `${BASE}/candidateged/GEDEvent_v${yy}_0_${m}.csv`;
    if (await exists(url)) files.push(url); else missing.push(m);
  }
  if (missing.some(m => m <= 6)) {
    const h1 = `${BASE}/candidateged/GEDEvent_v${yy}_01_${yy}_06.csv`;
    if (await exists(h1)) files.push(h1);
  }
  if (missing.some(m => m > 6)) {
    const h2 = `${BASE}/candidateged/GEDEvent_v${yy}_07_${yy}_12.csv`;
    if (await exists(h2)) files.push(h2);
  }
  return files;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {(name: string) => string|null} [resolveName]  country name → iso2 (from DB)
 * @returns {Promise<Map<string, number>>}  iso2 → decay-weighted fatalities since START_YEAR
 */
async function fetchUcdpConflict(resolveName) {
  const agg = makeAggregator(resolveName);

  const final = await latestFinalRelease();
  console.log(`[UCDP] Final GED ${final.version} (through ${final.coversThrough}) — downloading…`);
  const zip = await download(final.url, `${CACHE_DIR}/ged${final.version.replace('.', '')}.zip`);
  await streamZipCsv(zip, agg);
  let s = agg.stats();
  console.log(`[UCDP] GED: ${s.rows} rows, ${s.kept} events since ${START_YEAR} matched`);

  const thisYear = new Date().getFullYear();
  for (let y = final.coversThrough + 1; y <= thisYear; y++) {
    const files = await candidateFiles(y);
    console.log(`[UCDP] Candidate ${y}: ${files.length} file(s)`);
    for (const url of files) {
      const path = await download(url, `${CACHE_DIR}/${url.split('/').pop()}`);
      await streamCsvFile(path, agg);
    }
  }

  s = agg.stats();
  if (s.unmatched.size) {
    const top = [...s.unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([n, f]) => `${n} (${Math.round(f)})`).join(', ');
    console.warn(`[UCDP] Unmatched country names (fatalities): ${top}`);
  }
  console.log(`[UCDP] Done. ${agg.totals.size} countries with weighted fatalities.`);
  return agg.totals;
}

module.exports = { fetchUcdpConflict };
