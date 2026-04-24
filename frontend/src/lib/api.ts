import { Weights } from '@/types/weights';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function postWeights(weights: Weights, top_n: number) {
  const res = await fetch(`${BASE}/api/custom-weights`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ weights, top_n }),
  });
  if (!res.ok) throw new Error('Failed to fetch scores');
  return res.json();
}

export async function fetchTopN(weights: Weights, n = 10) {
  return postWeights(weights, n);
}

export async function fetchBottomN(weights: Weights, n = 10) {
  const json = await postWeights(weights, 300);
  const all  = json.data as any[];
  return {
    ...json,
    data: all.slice(-n).reverse().map((row: any, i: number) => ({ ...row, rank: i + 1 })),
  };
}

// keep legacy names
export const fetchTop10    = (w: Weights) => fetchTopN(w, 10);
export const fetchBottom10 = (w: Weights) => fetchBottomN(w, 10);

export async function fetchSafety(lat: number, lon: number, radius?: number) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (radius) params.set('radius', String(radius));
  const res = await fetch(`${BASE}/api/safety?${params}`);
  if (!res.ok) throw new Error('Failed to fetch safety data');
  return res.json();
}

export async function fetchMapFeature(countryCode: string) {
  const res = await fetch(`${BASE}/api/map?country=${countryCode}`);
  if (!res.ok) throw new Error('Failed to fetch map feature');
  return res.json();
}

export async function fetchTrends(countryCode: string) {
  const res = await fetch(`${BASE}/api/trends/${countryCode}`);
  if (!res.ok) throw new Error('Failed to fetch trends');
  return res.json();
}
