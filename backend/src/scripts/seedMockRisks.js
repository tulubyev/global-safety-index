require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { getDb } = require('../services/dbService');

// Rough real-world buckets so the map looks meaningful
const REGIONAL_BASELINES = {
  'Western Europe':  { conflict: 3,  disaster: 15, food: 5  },
  'Northern Europe': { conflict: 2,  disaster: 10, food: 4  },
  'Southern Europe': { conflict: 5,  disaster: 20, food: 8  },
  'Eastern Europe':  { conflict: 25, disaster: 18, food: 20 },
  'Northern America':{ conflict: 8,  disaster: 30, food: 6  },
  'Latin America':   { conflict: 35, disaster: 45, food: 30 },
  'Northern Africa': { conflict: 40, disaster: 35, food: 45 },
  'Western Africa':  { conflict: 55, disaster: 40, food: 60 },
  'Eastern Africa':  { conflict: 60, disaster: 45, food: 65 },
  'Middle Africa':   { conflict: 65, disaster: 40, food: 70 },
  'Southern Africa': { conflict: 45, disaster: 35, food: 50 },
  'Western Asia':    { conflict: 55, disaster: 30, food: 35 },
  'Central Asia':    { conflict: 30, disaster: 35, food: 40 },
  'Southern Asia':   { conflict: 45, disaster: 50, food: 45 },
  'Eastern Asia':    { conflict: 15, disaster: 40, food: 15 },
  'South-eastern Asia': { conflict: 25, disaster: 55, food: 25 },
  'Oceania':         { conflict: 5,  disaster: 35, food: 8  },
  'Melanesia':       { conflict: 20, disaster: 50, food: 30 },
  'Polynesia':       { conflict: 5,  disaster: 40, food: 15 },
  'Micronesia':      { conflict: 5,  disaster: 45, food: 20 },
  'Caribbean':       { conflict: 40, disaster: 50, food: 40 },
};

const DEFAULT = { conflict: 40, disaster: 35, food: 35 };

function jitter(base, range = 12) {
  return Math.min(100, Math.max(0, base + (Math.random() - 0.5) * range * 2));
}

async function main() {
  const db = getDb();
  const { rows: countries } = await db.query('SELECT code, subregion, region FROM countries');
  console.log(`Seeding mock risks for ${countries.length} countries...`);

  let inserted = 0;
  for (const c of countries) {
    const base = REGIONAL_BASELINES[c.subregion] || REGIONAL_BASELINES[c.region] || DEFAULT;
    const conflict = jitter(base.conflict);
    const disaster = jitter(base.disaster);
    const food     = jitter(base.food);

    await db.query(
      `INSERT INTO risks (country_code, measured_at, conflict, disaster, food, source)
       VALUES ($1, '2024-01-01', $2, $3, $4, 'mock')
       ON CONFLICT (country_code, measured_at) DO UPDATE SET
         conflict = EXCLUDED.conflict,
         disaster = EXCLUDED.disaster,
         food     = EXCLUDED.food`,
      [c.code, conflict.toFixed(2), disaster.toFixed(2), food.toFixed(2)]
    );
    inserted++;
  }

  console.log(`Done: ${inserted} mock risk records inserted`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
