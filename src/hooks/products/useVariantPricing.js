import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStockPieces } from '@/services/inventoryService';
import { useSelector } from 'react-redux';
import { priceItemAsSold } from '@/services/pricingService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {object|null} item — full item object (from Style/Retrieve's
 *   style_variants[] or Items/Retrieve), or null/undefined to disable.
 */
export function useVariantPricing(item) {
  const activeStoreId = useSelector(selectActiveStoreId);
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: QUERY_KEYS.ITEMS.PRICING(item?.item_id, activeStoreId),
    queryFn: async () => {
      const stock = activeStoreId
        ? await queryClient.fetchQuery({
          queryKey: QUERY_KEYS.CATALOG.CLAIMABLE_STOCK(item.item_id, activeStoreId),
          queryFn: () => getStockPieces({ itemId: item.item_id, companyId: activeStoreId, take: 0 }),
          staleTime: APP_CONFIG.STALE_TIME.STOCK,
        })
        : null;
      return priceItemAsSold({ item, companyId: activeStoreId, stockRows: stock?.data?.Entities });
    },
    enabled: !!item?.item_id,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
  });
}
