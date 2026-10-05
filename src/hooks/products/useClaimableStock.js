import { useQuery } from '@tanstack/react-query';
import { getStockPieces } from '@/services/inventoryService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {number|null} itemId
 * @param {number|null} companyId
 * @param {{ enabled?: boolean }} [options]
 * @returns {{
 *   claimablePieces: number|null,  // real, billable-today count — null until resolved
 *   isLoading: boolean,
 *   isError: boolean,
 * }}
 */
export function useClaimableStock(itemId, companyId, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: QUERY_KEYS.CATALOG.CLAIMABLE_STOCK(itemId, companyId),
    queryFn:  () => getStockPieces({ itemId, companyId, take: 0 }),
    enabled:  enabled && !!itemId && !!companyId,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
    select: (response) => {
      const rows = response?.data?.Entities ?? [];
      return rows.filter((r) => !r.is_allocated).length;
    },
  });

  return {
    claimablePieces: query.data ?? null,
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}
