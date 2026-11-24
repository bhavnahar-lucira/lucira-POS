// src/hooks/frejun/useFrejunAnalytics.js
import { useQuery } from '@tanstack/react-query';
import { getFrejunAnalytics } from '@/services/frejunService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useFrejunAnalytics(params = {}, { enabled = true, refetchInterval = false } = {}) {
  const {
    dateStart = '',
    dateEnd = '',
    users = '',
  } = params;

  const queryParams = {
    dateStart: dateStart.trim(),
    dateEnd: dateEnd.trim(),
    users: users.trim(),
  };

  const query = useQuery({
    queryKey: QUERY_KEYS.FREJUN.ANALYTICS(queryParams),
    queryFn: () => getFrejunAnalytics(queryParams),
    enabled,
    staleTime: 30 * 1000,
    refetchInterval,
  });

  const analytics = query.data ?? [];

  return {
    analytics,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updatedAt: query.dataUpdatedAt,
  };
}
