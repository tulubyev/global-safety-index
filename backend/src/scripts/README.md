# Scripts

Only bootstrap tooling lives here. **Risk data is written exclusively by the
weekly pipeline** (`src/cron/weeklyUpdate.js`).

## importCountries.js

Populates the `countries` table (ISO2 code, names, region, PostGIS geometry)
from the public geo-countries GeoJSON. Run once when setting up a new database,
before the first pipeline run — the pipeline skips any country that has no row
here.

```bash
node src/scripts/importCountries.js
```

## Why there are no per-source import scripts

There used to be one script per source (`importUcdp.js`, `importWorldBank.js`,
`importGtd.js`, …) plus `seedMockRisks.js`. They wrote into the same `risks`
table as the pipeline but scaled their values with min-max normalisation, and
the seeder wrote invented numbers outright. Running any of them silently
desynchronised the data: some rows scaled against fixed anchors, others against
whichever countries happened to be in that script's batch.

They were removed in favour of the single pipeline. To refresh data, run it:

```bash
docker exec safety-api node -e "require('./src/cron/weeklyUpdate').runWeeklyUpdate().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"
```

Git history has the old scripts if a one-off backfill is ever needed.
