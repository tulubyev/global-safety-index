import { Weights } from '@/types/weights';

/**
 * Mirror of backend/src/services/scoreService.js — keep the two in sync.
 *
 *   raw   = Σ wᵢ · dimᵢ         (weights normalised to sum 1, dims 0–100)
 *   score = √(raw / 100) · 100   (absolute 0–100, not relative to other countries)
 */

export type Dims = Record<keyof Weights, number | string | null | undefined>;

const KEYS: (keyof Weights)[] = ['conflict', 'disaster', 'food', 'seismic', 'pandemic'];

export function normalizeWeights(weights: Weights): Record<keyof Weights, number> {
  const out = {} as Record<keyof Weights, number>;
  let sum = 0;
  for (const k of KEYS) {
    const v = Math.max(0, Number(weights[k]) || 0);
    out[k] = v;
    sum += v;
  }
  if (sum === 0) return { conflict: 0.3, disaster: 0.2, food: 0.2, seismic: 0.1, pandemic: 0.2 };
  for (const k of KEYS) out[k] /= sum;
  return out;
}

export function rawScore(dims: Dims, weights: Weights): number {
  const w = normalizeWeights(weights);
  let raw = 0;
  for (const k of KEYS) raw += w[k] * (Number(dims[k]) || 0);
  return Math.min(100, Math.max(0, raw));
}

export function scoreFromRaw(raw: number): number {
  const r = Math.min(100, Math.max(0, raw));
  return Math.sqrt(r / 100) * 100;
}

export function compositeScore(dims: Dims, weights: Weights): number {
  return scoreFromRaw(rawScore(dims, weights));
}
