import { useQuery } from '@tanstack/react-query';
import { getFrejunSummary } from '@/services/frejunService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useFrejunSummary({ store = '', userEmail = '', tag = '', search = '', dateStart = '', dateEnd = '' } = {}, { enabled = true, refetchInterval = false } = {}) {
  const params = { store, userEmail, tag, search: search.trim(), dateStart, dateEnd };
  const query = useQuery({
    queryKey: QUERY_KEYS.FREJUN.SUMMARY(params),
    queryFn: () => getFrejunSummary(params),
    enabled,
    staleTime: 30 * 1000,
    refetchInterval,
    placeholderData: (previousData) => previousData,
  });
  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
