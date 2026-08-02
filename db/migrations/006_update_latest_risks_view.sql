-- Migration 006 — Recreate latest_risks view with seismic + pandemic columns
-- (004 created view before 005 added these columns)

CREATE OR REPLACE VIEW latest_risks AS
  SELECT DISTINCT ON (r.country_code)
    c.code, c.name, c.name_ru, c.region, c.geom,
    r.conflict, r.disaster, r.food, r.seismic, r.pandemic, r.score, r.measured_at
  FROM risks r
  JOIN countries c ON c.code = r.country_code
  ORDER BY r.country_code, r.measured_at DESC;
