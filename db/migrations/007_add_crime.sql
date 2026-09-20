-- Migration 007 — Add the `crime` dimension (UNODC intentional homicide rate)
--
-- CREATE OR REPLACE VIEW cannot add a column in the middle of an existing
-- view, so latest_risks is dropped and recreated (see migration 006).

ALTER TABLE risks ADD COLUMN IF NOT EXISTS crime NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_crime_check;
ALTER TABLE risks ADD CONSTRAINT risks_crime_check CHECK (crime BETWEEN 0 AND 100);

DROP VIEW IF EXISTS latest_risks;

CREATE VIEW latest_risks AS
  SELECT DISTINCT ON (r.country_code)
    c.code, c.name, c.name_ru, c.region, c.geom,
    r.conflict, r.crime, r.disaster, r.food, r.seismic, r.pandemic,
    r.score, r.measured_at
  FROM risks r
  JOIN countries c ON c.code = r.country_code
  ORDER BY r.country_code, r.measured_at DESC;
