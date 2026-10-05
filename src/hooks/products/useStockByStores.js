import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
import { getStockByStores } from '@/services/inventoryService';

/**
 * @param {number} itemId
 */
export function useStockByStores(itemId) {
  const query = useQuery({
    queryKey:  QUERY_KEYS.CATALOG.STOCK_BY_STORES(itemId),
    queryFn:   () => getStockByStores(itemId),
    enabled:   !!itemId,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
    select: (response) => {
      const entities = response?.data?.Entities;
      if (!Array.isArray(entities)) return [];

      // Group by company_id so each store appears once,
      // summing pieces across multiple locations in the same store.
      const storeMap = new Map();
      for (const entry of entities) {
        const id = entry.company_id;
        if (storeMap.has(id)) {
          storeMap.get(id).pieces += entry.pieces ?? 0;
        } else {
          storeMap.set(id, {
            company_id:  entry.company_id,
            companyname: entry.companyname,
            pieces:      entry.pieces ?? 0,
          });
        }
      }
      return Array.from(storeMap.values());
    },
  });

  return {
    data:      query.data,
    isLoading: query.isLoading,
    isError:   query.isError,
    error:     query.error,
    refetch:   query.refetch,
  };
}
