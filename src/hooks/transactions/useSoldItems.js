// What a given customer has actually purchased — i.e. what they can return.
// Feeds the Returns form's item picker; the selected rows go straight into
// calculateReturnItems() (see returnItemsService.js for why the raw row
// must be passed through unmodified). NOT scoped to the active store — a
// cross-store row is a legitimate Interstore Return candidate, not
// something to hide (see getSoldItems's own header for why).

import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getSoldItems } from '@/services/returnItemsService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {number|null} partyId — attached customer
 * @param {number} [transactionType] — Return=1 (default), Exchange=2, Buyback=3
 */
export function useSoldItems(partyId, transactionType = 1) {
  const activeStoreId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey:  QUERY_KEYS.RETURNS.SOLD_ITEMS(partyId, activeStoreId, transactionType),
    queryFn:   () => getSoldItems({ partyId, companyId: activeStoreId, transactionType }),
    enabled:   !!partyId && !!activeStoreId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    soldItems: query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
