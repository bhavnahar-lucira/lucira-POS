// Master (nominal-spec) price for one item — the rate a Made to Order
// shortfall actually bills at, distinct from useVariantPricing's real-piece
// price. Only needed once a requested quantity exceeds available stock.

import { useQuery } from '@tanstack/react-query';
import { priceItemAsMaster } from '@/services/pricingService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {object|null} item — full item object, or null/undefined to disable.
 * @param {boolean} enabled — gate this off until the page actually needs a
 *   Made to Order rate (avoids doubling every product view's pricing calls).
 */
export function useMasterPricing(item, enabled) {
  return useQuery({
    queryKey: QUERY_KEYS.ITEMS.MASTER_PRICING(item?.item_id),
    queryFn: () => priceItemAsMaster(item),
    enabled: !!item?.item_id && enabled,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
  });
}
