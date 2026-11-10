import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getCustomerCredits } from '@/services/refundService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';

/**
 * @param {number|null} partyId — attached customer
 */
export function useCustomerCredits(partyId) {
  const activeStoreId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey:  QUERY_KEYS.REFUNDS.CUSTOMER_CREDITS(partyId, activeStoreId),
    queryFn:   () => getCustomerCredits({ partyId }),
    enabled:   !!partyId && !!activeStoreId,
    staleTime: 0,
    gcTime:    0,
  });

  return {
    credits:   query.data ?? [],
    isLoading: query.isPending,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
