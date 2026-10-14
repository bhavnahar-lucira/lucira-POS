import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';

async function fetchBuyerHistory(customerId) {
  const res = await fetch(`/api/buyers/${customerId}`);
  if (!res.ok) throw new Error('Failed to load purchase history');
  const data = await res.json();
  return data?.purchases ?? [];
}

export function useBuyerHistory(customerId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.BUYERS.HISTORY(customerId),
    queryFn:  () => fetchBuyerHistory(customerId),
    enabled:  !!customerId,
    staleTime: 0,
  });

  return {
    purchases: query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
