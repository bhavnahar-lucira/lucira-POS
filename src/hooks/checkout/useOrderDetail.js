import { useQuery } from '@tanstack/react-query';
import { getOrderDetail } from '@/services/orderService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useOrderDetail(orderId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.ORDERS.DETAIL(orderId),
    queryFn:  async () => {
      const data = await getOrderDetail(orderId);
      return data?.Entity ?? null;
    },
    enabled:   !!orderId,
    // Also used by OrderConfirmationScreen right after placing an order —
    // checkout data must always reflect live state (see
    // useCheckoutPricing/useActivePromotions/useRetrieveCustomer).
    staleTime: 0,
  });

  return {
    order:     query.data ?? null,
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
