import { useQuery } from '@tanstack/react-query';
import { searchMasterItems } from '@/services/itemService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useItemMasterSearch(query) {
  const trimmed = (query ?? '').trim();

  const result = useQuery({
    queryKey: QUERY_KEYS.ITEMS.MASTER_SEARCH(trimmed),
    queryFn:  async () => {
      const data = await searchMasterItems(trimmed);
      return data?.Entities ?? [];
    },
    enabled:   trimmed.length >= 2,
    staleTime: 0,
  });

  return {
    results:   result.data ?? [],
    isLoading: result.isLoading,
  };
}
