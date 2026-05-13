-- ============================================================
--  Migration 005 — Add pandemic column, fix score column
--
--  Changes:
--  1. Drop GENERATED score (weights were hardcoded, seismic excluded)
--  2. Add score as a plain NUMERIC — will be computed by the app
--  3. Add pandemic NUMERIC(5,2) — new risk dimension
--  4. Add missing CHECK constraint on seismic
--  5. Backfill score for existing rows using old formula (no pandemic yet)
-- ============================================================

-- 1. Drop the GENERATED ALWAYS AS score column
ALTER TABLE risks DROP COLUMN score;

-- 2. Add score as a regular column (app computes it on insert/update)
ALTER TABLE risks ADD COLUMN score NUMERIC(5,2);

-- 3. Add pandemic dimension (nullable → default 0 for all existing rows)
ALTER TABLE risks ADD COLUMN pandemic NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE risks ADD CONSTRAINT risks_pandemic_check
  CHECK (pandemic BETWEEN 0 AND 100);

-- 4. Add missing CHECK constraint for seismic
ALTER TABLE risks ADD CONSTRAINT risks_seismic_check
  CHECK (seismic BETWEEN 0 AND 100);

-- 5. Backfill score for existing rows using the old 3-factor formula
--    (pandemic = 0 for all historical rows, seismic not in old formula)
UPDATE risks
SET score = ROUND(0.35 * conflict + 0.35 * disaster + 0.30 * food, 2);
