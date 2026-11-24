import { useQuery } from '@tanstack/react-query';
import { getFrejunAgents } from '@/services/frejunService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useFrejunAgents({ store = '', dateStart = '', dateEnd = '' } = {}, { enabled = true, refetchInterval = false } = {}) {
  const params = { store, dateStart, dateEnd };
  const query = useQuery({
    queryKey: QUERY_KEYS.FREJUN.AGENTS(params),
    queryFn: () => getFrejunAgents(params),
    enabled: enabled && !!store && store !== 'all',
    staleTime: 30 * 1000,
    refetchInterval,
  });
  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    updatedAt: query.dataUpdatedAt,
  };
}
