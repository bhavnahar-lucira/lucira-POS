import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { searchBySku } from '@/services/catalogService';

/**
 * @param {string}      query   - search text (already debounced by the caller)
 * @param {number|null} storeId - current_company_id to scope results to
 */
export function useSkuSearch(query, storeId) {
  return useQuery({
    queryKey: QUERY_KEYS.CATALOG.SKU_SEARCH(query, storeId),
    queryFn:  ({ signal }) => searchBySku({ query, storeId, signal }),
    enabled:  !!query && !!storeId,
    staleTime: 0, // always fresh — this is the fast/live path
  });
}
