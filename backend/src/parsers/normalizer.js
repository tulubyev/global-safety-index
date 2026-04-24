function minMaxNormalize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0);
  return values.map((v) => ((v - min) / (max - min)) * 100);
}

module.exports = { minMaxNormalize };
