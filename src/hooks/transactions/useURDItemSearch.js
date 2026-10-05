import { useQuery } from '@tanstack/react-query';
import { searchURDItems } from '@/services/itemService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useURDItemSearch(query, baseItemId) {
  const trimmed = (query ?? '').trim();

  const result = useQuery({
    queryKey: QUERY_KEYS.ITEMS.URD_SEARCH(trimmed, baseItemId),
    queryFn:  async () => {
      const data = await searchURDItems(trimmed, baseItemId);
      return data?.Entities ?? [];
    },
    enabled:   !!baseItemId,
    staleTime: 0,
  });

  return {
    results:   result.data ?? [],
    isLoading: result.isLoading,
  };
}
