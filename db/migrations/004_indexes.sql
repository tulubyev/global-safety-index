CREATE VIEW latest_risks AS
  SELECT DISTINCT ON (r.country_code)
    c.code, c.name, c.name_ru, c.region, c.geom,
    r.conflict, r.disaster, r.food, r.score, r.measured_at
  FROM risks r
  JOIN countries c ON c.code = r.country_code
  ORDER BY r.country_code, r.measured_at DESC;
