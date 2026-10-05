import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { searchByExactSku } from '@/services/catalogService';

/**
 * @param {string}      query   - search text (already debounced by the caller)
 * @param {number|null} storeId - active store, used to tag has_stock accurately
 */
export function useExactSkuSearch(query, storeId) {
  return useQuery({
    queryKey: QUERY_KEYS.CATALOG.EXACT_SKU_SEARCH(query, storeId),
    queryFn:  () => searchByExactSku({ sku: query, companyId: storeId }),
    enabled:  !!query && !!storeId,
    staleTime: 0,
  });
}
