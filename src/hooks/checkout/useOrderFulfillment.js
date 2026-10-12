import { useQuery } from '@tanstack/react-query';
import { getReadyToInvoiceLines, getAllOpenOrderLines } from '@/services/orderFulfillmentService';
import { QUERY_KEYS } from '@/constants/queryKeys';

/**
 * @param {{ partyId: number|null, enabled?: boolean }} params
 */
export function useOrderFulfillment({ partyId, enabled = true }) {
  const isEnabled = enabled && !!partyId;

  // Which order lines are ready/open to fulfil right now — checkout data
  // must always reflect live state (see useCheckoutPricing/
  // useActivePromotions/useRetrieveCustomer).
  const readyQuery = useQuery({
    queryKey:  QUERY_KEYS.ORDER_FULFILLMENT.READY_TO_INVOICE(partyId),
    queryFn:   () => getReadyToInvoiceLines({ partyId }),
    enabled:   isEnabled,
    staleTime: 0,
  });

  const allOpenQuery = useQuery({
    queryKey:  QUERY_KEYS.ORDER_FULFILLMENT.ALL_OPEN(partyId),
    queryFn:   () => getAllOpenOrderLines({ partyId }),
    enabled:   isEnabled,
    staleTime: 0,
  });

  return {
    readyLines:      readyQuery.data ?? [],
    allOpenLines:    allOpenQuery.data ?? [],
    isLoadingReady:  readyQuery.isLoading,
    isLoadingAll:    allOpenQuery.isLoading,
    isError:         readyQuery.isError || allOpenQuery.isError,
    refetch: () => {
      readyQuery.refetch();
      allOpenQuery.refetch();
    },
  };
}
