'use strict';
/**
 * Single source of truth for the composite safety score.
 *
 * Every route (map, custom-weights, top10, safety) and the weekly cron must
 * go through this module so a given country shows the same number everywhere.
 * Adding a dimension here propagates it to every consumer.
 *
 *   raw   = Σ wᵢ · dimᵢ / Σ wᵢ     (over the dimensions that have data)
 *   score = √(raw / 100) · 100      (absolute, 0–100 — NOT relative to other countries)
 *
 * The square root spreads out the low end so that "quiet" countries are still
 * distinguishable instead of being crushed against zero by a few extreme ones.
 *
 * A dimension may be null: "we have no data", which is not the same as a
 * measured zero. Null dimensions are dropped and the remaining weights are
 * renormalised, so missing data neither inflates nor deflates the score — it
 * only makes it less well supported. Callers should surface `coverage()`
 * alongside the score so that is visible.
 */

const DIMENSIONS = ['conflict', 'crime', 'disaster', 'food', 'seismic', 'pandemic'];

const DEFAULT_WEIGHTS = Object.freeze({
  conflict: 0.25,
  crime:    0.20,
  disaster: 0.15,
  food:     0.15,
  seismic:  0.10,
  pandemic: 0.15,
});

/** Normalise an arbitrary non-negative weight object so the values sum to 1. */
function normalizeWeights(weights = DEFAULT_WEIGHTS) {
  const w = {};
  let sum = 0;
  for (const d of DIMENSIONS) {
    const v = Math.max(0, Number(weights[d]) || 0);
    w[d] = v;
    sum += v;
  }
  if (sum === 0) return { ...DEFAULT_WEIGHTS };
  for (const d of DIMENSIONS) w[d] /= sum;
  return w;
}

/** True when a dimension carries a real measurement — including a measured 0. */
function hasValue(v) {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

/** How many of the dimensions actually have data. */
function coverage(dims) {
  return DIMENSIONS.filter(d => hasValue(dims[d])).length;
}

/**
 * Weighted mean of the dimensions that have data (0–100).
 * With full coverage the weights already sum to 1 and this is a plain
 * weighted sum; with gaps it renormalises over what is present.
 */
function rawScore(dims, weights = DEFAULT_WEIGHTS) {
  const w = normalizeWeights(weights);
  let sum = 0, wsum = 0;
  for (const d of DIMENSIONS) {
    if (!hasValue(dims[d])) continue;
    sum  += w[d] * Number(dims[d]);
    wsum += w[d];
  }
  if (wsum === 0) return 0;
  return Math.min(100, Math.max(0, sum / wsum));
}

/** Absolute 0–100 composite score from a raw weighted value. */
function scoreFromRaw(raw) {
  const r = Math.min(100, Math.max(0, Number(raw) || 0));
  return Math.sqrt(r / 100) * 100;
}

/** Convenience: dims + weights → final score. */
function compositeScore(dims, weights = DEFAULT_WEIGHTS) {
  return scoreFromRaw(rawScore(dims, weights));
}

module.exports = {
  DIMENSIONS,
  hasValue,
  coverage,
  DEFAULT_WEIGHTS,
  normalizeWeights,
  rawScore,
  scoreFromRaw,
  compositeScore,
};
