import { Weights } from '@/types/weights';

/**
 * Mirror of backend/src/services/scoreService.js — keep the two in sync.
 *
 *   raw   = Σ wᵢ · dimᵢ         (weights normalised to sum 1, dims 0–100)
 *   score = √(raw / 100) · 100   (absolute 0–100, not relative to other countries)
 */

export type Dims = Record<keyof Weights, number | string | null | undefined>;

const KEYS: (keyof Weights)[] = ['conflict', 'crime', 'road', 'disaster', 'food', 'seismic', 'pandemic'];

export function normalizeWeights(weights: Weights): Record<keyof Weights, number> {
  const out = {} as Record<keyof Weights, number>;
  let sum = 0;
  for (const k of KEYS) {
    const v = Math.max(0, Number(weights[k]) || 0);
    out[k] = v;
    sum += v;
  }
  if (sum === 0) return { conflict: 0.20, crime: 0.18, road: 0.12, disaster: 0.14, food: 0.12, seismic: 0.09, pandemic: 0.15 };
  for (const k of KEYS) out[k] /= sum;
  return out;
}

/** A dimension carries a real measurement — including a measured 0. */
export function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

/** How many dimensions actually have data. */
export function coverage(dims: Dims): number {
  return KEYS.filter(k => hasValue(dims[k])).length;
}

export const DIMENSION_COUNT = KEYS.length;

/**
 * Weighted mean over the dimensions that have data. Null means "unknown",
 * not zero: it is dropped and the remaining weights are renormalised.
 */
export function rawScore(dims: Dims, weights: Weights): number {
  const w = normalizeWeights(weights);
  let sum = 0, wsum = 0;
  for (const k of KEYS) {
    if (!hasValue(dims[k])) continue;
    sum  += w[k] * Number(dims[k]);
    wsum += w[k];
  }
  if (wsum === 0) return 0;
  return Math.min(100, Math.max(0, sum / wsum));
}

export function scoreFromRaw(raw: number): number {
  const r = Math.min(100, Math.max(0, raw));
  return Math.sqrt(r / 100) * 100;
}

export function compositeScore(dims: Dims, weights: Weights): number {
  return scoreFromRaw(rawScore(dims, weights));
}
