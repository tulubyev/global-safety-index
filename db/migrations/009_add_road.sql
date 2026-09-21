-- Migration 009 — Add the `road` dimension (road traffic deaths per 100k)
--
-- Road crashes kill more travellers than crime or terrorism. WHO Global Health
-- Observatory data, reached through World Bank indicator SH.STA.TRAF.P5.

ALTER TABLE risks ADD COLUMN IF NOT EXISTS road NUMERIC(5,2);

ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_road_check;
ALTER TABLE risks ADD CONSTRAINT risks_road_check CHECK (road BETWEEN 0 AND 100);

DROP VIEW IF EXISTS latest_risks;

CREATE VIEW latest_risks AS
  SELECT DISTINCT ON (r.country_code)
    c.code, c.name, c.name_ru, c.region, c.geom,
    r.conflict, r.crime, r.road, r.disaster, r.food, r.seismic, r.pandemic,
    r.score, r.measured_at
  FROM risks r
  JOIN countries c ON c.code = r.country_code
  ORDER BY r.country_code, r.measured_at DESC;
