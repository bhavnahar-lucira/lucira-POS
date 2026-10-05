import { useQuery } from '@tanstack/react-query';
import { getReadyToInvoiceLines, getAllOpenOrderLines } from '@/services/orderFulfillmentService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {{ partyId: number|null, enabled?: boolean }} params
 */
export function useOrderFulfillment({ partyId, enabled = true }) {
  const isEnabled = enabled && !!partyId;

  const readyQuery = useQuery({
    queryKey:  QUERY_KEYS.ORDER_FULFILLMENT.READY_TO_INVOICE(partyId),
    queryFn:   () => getReadyToInvoiceLines({ partyId }),
    enabled:   isEnabled,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  const allOpenQuery = useQuery({
    queryKey:  QUERY_KEYS.ORDER_FULFILLMENT.ALL_OPEN(partyId),
    queryFn:   () => getAllOpenOrderLines({ partyId }),
    enabled:   isEnabled,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
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
