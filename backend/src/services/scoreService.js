'use strict';
/**
 * Single source of truth for the composite safety score.
 *
 * Every route (map, custom-weights, top10, safety) and the weekly cron must
 * go through this module so a given country shows the same number everywhere.
 * Adding a dimension here propagates it to every consumer.
 *
 *   raw   = Σ wᵢ · dimᵢ            (weights normalised to sum 1, dims 0–100)
 *   score = √(raw / 100) · 100      (absolute, 0–100 — NOT relative to other countries)
 *
 * The square root spreads out the low end so that "quiet" countries are still
 * distinguishable instead of being crushed against zero by a few extreme ones.
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

/** Weighted linear combination of the five dimensions (0–100). */
function rawScore(dims, weights = DEFAULT_WEIGHTS) {
  const w = normalizeWeights(weights);
  let raw = 0;
  for (const d of DIMENSIONS) raw += w[d] * (Number(dims[d]) || 0);
  return Math.min(100, Math.max(0, raw));
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
  DEFAULT_WEIGHTS,
  normalizeWeights,
  rawScore,
  scoreFromRaw,
  compositeScore,
};
