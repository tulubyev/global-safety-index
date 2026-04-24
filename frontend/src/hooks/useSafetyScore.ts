import { useQuery } from '@tanstack/react-query';
import { fetchTopN, fetchBottomN, fetchTrends } from '@/lib/api';
import { Weights } from '@/types/weights';

export function useTopN(weights: Weights, n: number) {
  return useQuery({
    queryKey: ['topN', weights, n],
    queryFn:  () => fetchTopN(weights, n),
    staleTime: 1000 * 60 * 5,
  });
}

export function useBottomN(weights: Weights, n: number) {
  return useQuery({
    queryKey: ['bottomN', weights, n],
    queryFn:  () => fetchBottomN(weights, n),
    staleTime: 1000 * 60 * 5,
  });
}

// keep legacy exports
export const useTop10    = (w: Weights) => useTopN(w, 10);
export const useBottom10 = (w: Weights) => useBottomN(w, 10);

export function useTrends(countryCode: string | null) {
  return useQuery({
    queryKey: ['trends', countryCode],
    queryFn:  () => fetchTrends(countryCode!),
    enabled:  !!countryCode,
    staleTime: 1000 * 60 * 30,
  });
}
