'use strict';
/**
 * Absolute 0–100 scales.
 *
 * Min-max normalisation makes a country's score depend on which other
 * countries are in the dataset: if the worst country improves, everyone else's
 * score moves without anything changing on the ground, and historical series
 * are not comparable between runs. These helpers map a real-world quantity to
 * 0–100 through fixed anchor points instead, so a value always means the same
 * thing.
 */

/**
 * Piecewise-linear interpolation through ascending [input, output] anchors.
 * Values below the first anchor or above the last clamp to its output.
 */
function anchoredScale(value, anchors) {
  const v = Number(value);
  if (!Number.isFinite(v)) return anchors[0][1];
  if (v <= anchors[0][0]) return anchors[0][1];

  const last = anchors[anchors.length - 1];
  if (v >= last[0]) return last[1];

  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (v <= x1) return y0 + (y1 - y0) * ((v - x0) / (x1 - x0));
  }
  return last[1];
}

/**
 * Same, interpolating on log10(value) — for heavy-tailed quantities where each
 * order of magnitude matters more than the absolute difference (fatality rates,
 * seismic energy). All anchor inputs must be > 0; value <= 0 returns the
 * first anchor's output.
 */
function logAnchoredScale(value, anchors) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return anchors[0][1];
  return anchoredScale(Math.log10(v), anchors.map(([x, y]) => [Math.log10(x), y]));
}

/** Apply a scale function to every value of a Map, rounding to 2 decimals. */
function scaleMap(map, fn) {
  const out = new Map();
  for (const [k, v] of map) {
    const s = fn(v);
    out.set(k, Math.round(Math.min(100, Math.max(0, s)) * 100) / 100);
  }
  return out;
}

module.exports = { anchoredScale, logAnchoredScale, scaleMap };
