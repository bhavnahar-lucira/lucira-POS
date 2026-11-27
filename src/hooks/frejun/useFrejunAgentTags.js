import { useQuery } from '@tanstack/react-query';
import { getFrejunAgentTags } from '@/services/frejunService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useFrejunAgentTags({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: QUERY_KEYS.FREJUN.TAGS(),
    queryFn: getFrejunAgentTags,
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
  return { agentTags: query.data ?? [], refetch: query.refetch };
}
