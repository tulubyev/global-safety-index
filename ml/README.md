# ML service — not deployed

FastAPI + Prophet, forecasting a country's composite score from its history.
The code works. It is deliberately **not** in `docker-compose.prod.yml`, and
`/api/trends` no longer calls it.

## Why

The index is built mostly from annual publications — INFORM, World Bank, FAO,
UNODC, WHO. Between releases a country's structural dimensions do not move, so
the stored series is a step function of *when sources published*, not a
trajectory of how the country changed. Prophet fitted to that, with
`yearly_seasonality=True`, returns confident-looking intervals for a signal
that is not there.

On top of that, history written before `pipeline-v2` used min-max scaling, so
it is not on the same scale as anything written since.

## When it would make sense

- Several years of history on one pipeline generation, and
- forecasting the fast-moving dimensions (conflict, disaster and pandemic
  events) rather than the composite score, since those do carry real dynamics.

At that point wire it back in: add the service to the prod compose file, set
`ML_SERVICE_URL`, and call it from `routes/trends.js`.
