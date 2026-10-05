import { useQuery } from '@tanstack/react-query';
import { getSoldItemsAcrossBranches } from '@/services/interstoreReturnService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/** @param {number|null} partyId */
export function useSoldItemsAcrossBranches(partyId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.INTERSTORE_RETURN.SOLD_ITEMS(partyId),
    queryFn: () => getSoldItemsAcrossBranches({ partyId }),
    enabled: !!partyId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    soldItems: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
