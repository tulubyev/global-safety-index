CREATE TABLE countries (
  id         SERIAL PRIMARY KEY,
  code       CHAR(2)      UNIQUE NOT NULL,
  code3      CHAR(3)      UNIQUE,
  name       VARCHAR(100) NOT NULL,
  name_ru    VARCHAR(100),
  geom       GEOMETRY(MultiPolygon, 4326),
  population BIGINT,
  region     VARCHAR(60),
  subregion  VARCHAR(60),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_countries_geom ON countries USING GIST(geom);
CREATE INDEX idx_countries_code ON countries(code);
