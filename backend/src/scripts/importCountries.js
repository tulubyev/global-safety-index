require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');
const { getDb } = require('../services/dbService');

const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading countries GeoJSON...');
  const geojson = await fetch(GEOJSON_URL);
  console.log(`Downloaded ${geojson.features.length} features`);
  console.log('Sample properties:', JSON.stringify(geojson.features[0].properties, null, 2));

  const db = getDb();
  let inserted = 0;
  let skipped = 0;

  for (const feature of geojson.features) {
    const props = feature.properties;

    // Support multiple possible field name conventions
    const code2 = props['ISO3166-1-Alpha-2'] || props.ISO_A2 || props.iso_a2;
    const code3 = props['ISO3166-1-Alpha-3'] || props.ISO_A3 || props.iso_a3;
    const name  = props.name || props.ADMIN || props.NAME;

    if (!code2 || code2 === '-99' || code2.length !== 2) { skipped++; continue; }

    let geom = feature.geometry;
    if (geom.type === 'Polygon') {
      geom = { type: 'MultiPolygon', coordinates: [geom.coordinates] };
    }

    try {
      await db.query(
        `INSERT INTO countries (code, code3, name, geom)
         VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
         ON CONFLICT (code) DO UPDATE SET
           code3 = EXCLUDED.code3,
           name  = EXCLUDED.name,
           geom  = EXCLUDED.geom`,
        [code2, code3 !== '-99' ? code3 : null, name, JSON.stringify(geom)]
      );
      inserted++;
      if (inserted % 20 === 0) process.stdout.write(`\r${inserted} countries imported...`);
    } catch (err) {
      console.error(`\nFailed ${name} (${code2}):`, err.message);
      skipped++;
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
