require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchUsgsSeismicRisk } = require('../parsers/usgsParser');
const { getDb }                = require('../services/dbService');

// Fuzzy country-name → ISO2 mapping for common USGS place suffixes
// USGS place strings end with country/ocean/territory names
const PLACE_TO_ISO2 = {
  'Japan': 'JP', 'Indonesia': 'ID', 'Papua New Guinea': 'PG', 'Chile': 'CL',
  'Peru': 'PE', 'Philippines': 'PH', 'Mexico': 'MX', 'New Zealand': 'NZ',
  'Greece': 'GR', 'Turkey': 'TR', 'Turkey (Turkiye)': 'TR', 'Türkiye': 'TR',
  'Italy': 'IT', 'Iran': 'IR', 'Afghanistan': 'AF', 'India': 'IN',
  'China': 'CN', 'Russia': 'RU', 'Pakistan': 'PK', 'Nepal': 'NP',
  'Ecuador': 'EC', 'Colombia': 'CO', 'Bolivia': 'BO', 'Argentina': 'AR',
  'United States': 'US', 'Alaska': 'US', 'Hawaii': 'US', 'California': 'US',
  'Canada': 'CA', 'Costa Rica': 'CR', 'Guatemala': 'GT', 'Honduras': 'HN',
  'Nicaragua': 'NI', 'El Salvador': 'SV', 'Panama': 'PA', 'Venezuela': 'VE',
  'Solomon Islands': 'SB', 'Vanuatu': 'VU', 'Fiji': 'FJ', 'Tonga': 'TO',
  'Taiwan': 'TW', 'Myanmar': 'MM', 'Thailand': 'TH', 'Vietnam': 'VN',
  'Malaysia': 'MY', 'Cambodia': 'KH', 'Laos': 'LA', 'Tajikistan': 'TJ',
  'Kyrgyzstan': 'KG', 'Kazakhstan': 'KZ', 'Uzbekistan': 'UZ',
  'Morocco': 'MA', 'Algeria': 'DZ', 'Libya': 'LY', 'Egypt': 'EG',
  'Ethiopia': 'ET', 'Kenya': 'KE', 'Tanzania': 'TZ', 'Mozambique': 'MZ',
  'Romania': 'RO', 'Bulgaria': 'BG', 'Croatia': 'HR', 'Serbia': 'RS',
  'Albania': 'AL', 'North Macedonia': 'MK', 'Montenegro': 'ME',
  'Iceland': 'IS', 'Portugal': 'PT', 'Spain': 'ES', 'France': 'FR',
  'Switzerland': 'CH', 'Austria': 'AT', 'Germany': 'DE',
  'Tonga Islands': 'TO', 'Kermadec Islands': 'NZ', 'Kuril Islands': 'RU',
  'Ryukyu Islands': 'JP', 'Bonin Islands': 'JP', 'Andaman Islands': 'IN',
  'Banda Sea': 'ID', 'Molucca Sea': 'ID', 'Sulawesi': 'ID',
  'Sumatra': 'ID', 'Java': 'ID', 'Flores Sea': 'ID',
  'South Sandwich Islands': 'GS',
  'Timor-Leste': 'TL', 'East Timor': 'TL',
  'Democratic Republic of the Congo': 'CD',
  'Congo': 'CG', 'Cameroon': 'CM',
  'Saudi Arabia': 'SA', 'Yemen': 'YE', 'Oman': 'OM', 'UAE': 'AE',
  'Israel': 'IL', 'Lebanon': 'LB', 'Syria': 'SY', 'Iraq': 'IQ',
  'Armenia': 'AM', 'Georgia': 'GE', 'Azerbaijan': 'AZ',
};

async function main() {
  console.log('Starting USGS seismic risk import...');
  const rawData = await fetchUsgsSeismicRisk();

  // Map place names → ISO2 codes
  const byCode = {};
  for (const { placeName, energy } of rawData) {
    const code = PLACE_TO_ISO2[placeName];
    if (!code) continue;
    byCode[code] = (byCode[code] || 0) + energy;
  }

  console.log(`Mapped ${Object.keys(byCode).length} countries from USGS place names`);

  // Log-scale to compress dynamic range, then normalize to 0-100
  const entries = Object.entries(byCode);
  const logScores = entries.map(([, e]) => Math.log1p(e));
  const maxLog    = Math.max(...logScores) || 1;
  const scored    = entries.map(([code], i) => ({
    code,
    seismic: ((logScores[i] / maxLog) * 100).toFixed(2),
  }));

  // Preview
  const preview = scored.sort((a, b) => b.seismic - a.seismic).slice(0, 12);
  console.log('Top 12 seismic risk (last 30 days):');
  console.table(preview);

  const db  = getDb();
  const now = new Date().toISOString().slice(0, 10);
  let updated = 0;

  for (const { code, seismic } of scored) {
    const { rows } = await db.query(
      `SELECT conflict, disaster, food FROM risks WHERE country_code=$1 ORDER BY measured_at DESC LIMIT 1`,
      [code]
    );
    if (!rows.length) continue;
    const { conflict, disaster, food } = rows[0];

    await db.query(
      `INSERT INTO risks (country_code, measured_at, conflict, disaster, food, seismic, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'usgs')
       ON CONFLICT (country_code, measured_at) DO UPDATE SET
         seismic = EXCLUDED.seismic,
         source  = 'usgs'`,
      [code, now, conflict, disaster, food, seismic]
    );
    updated++;
  }

  console.log(`Done: ${updated} countries updated with USGS seismic data`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
