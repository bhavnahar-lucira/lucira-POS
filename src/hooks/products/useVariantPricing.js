import { useQuery } from '@tanstack/react-query';
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

  return useQuery({
    queryKey: QUERY_KEYS.ITEMS.PRICING(item?.item_id, activeStoreId),
    queryFn: () => priceItemAsSold({ item, companyId: activeStoreId }),
    enabled: !!item?.item_id,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
  });
}
