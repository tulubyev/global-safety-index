// DEPRECATED — min-max makes a value depend on the rest of the batch, so a
// country's score moves when other countries move and history is not
// comparable between runs. Use parsers/scale.js (fixed anchors) instead.
// Kept only for gdeltParser.js, which is not wired into the pipeline.
function minMaxNormalize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0);
  return values.map((v) => ((v - min) / (max - min)) * 100);
}

module.exports = { minMaxNormalize };
