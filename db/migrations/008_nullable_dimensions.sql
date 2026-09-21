-- Migration 008 — let a dimension be "unknown" rather than 0
--
-- A country missing from World Bank or INFORM used to be stored as 0, which is
-- indistinguishable from a measured zero and made it look safe. The columns
-- become nullable so absence is representable; the score renormalises its
-- weights over the dimensions that are actually present.
--
-- Existing zeros are left as-is: they cannot be told apart retroactively and
-- the next pipeline run overwrites them.

ALTER TABLE risks ALTER COLUMN conflict DROP NOT NULL;
ALTER TABLE risks ALTER COLUMN disaster DROP NOT NULL;
ALTER TABLE risks ALTER COLUMN food     DROP NOT NULL;
ALTER TABLE risks ALTER COLUMN seismic  DROP NOT NULL;
ALTER TABLE risks ALTER COLUMN crime    DROP NOT NULL;
ALTER TABLE risks ALTER COLUMN pandemic DROP NOT NULL;

-- Defaults would turn an omitted value back into a fake zero
ALTER TABLE risks ALTER COLUMN crime    DROP DEFAULT;
ALTER TABLE risks ALTER COLUMN pandemic DROP DEFAULT;
