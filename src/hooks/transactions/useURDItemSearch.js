// SKU search across URD-eligible catalogue items, scoped to a Jewellery/Metal
// category (see itemService.URD_CATEGORY) — used by the URD Purchase item
// picker. See itemService.searchURDItems for why this hits a different
// endpoint/param shape than the generic master search.

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
