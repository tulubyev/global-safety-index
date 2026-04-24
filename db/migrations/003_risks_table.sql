CREATE TABLE risks (
  id           SERIAL PRIMARY KEY,
  country_code CHAR(2)      NOT NULL REFERENCES countries(code),
  measured_at  DATE         NOT NULL,
  conflict     NUMERIC(5,2) NOT NULL CHECK (conflict BETWEEN 0 AND 100),
  disaster     NUMERIC(5,2) NOT NULL CHECK (disaster BETWEEN 0 AND 100),
  food         NUMERIC(5,2) NOT NULL CHECK (food BETWEEN 0 AND 100),
  score        NUMERIC(5,2) GENERATED ALWAYS AS
                 (0.35 * conflict + 0.35 * disaster + 0.30 * food) STORED,
  source       VARCHAR(60),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country_code, measured_at)
);

CREATE INDEX idx_risks_country_date ON risks(country_code, measured_at DESC);
CREATE INDEX idx_risks_score ON risks(score ASC);
