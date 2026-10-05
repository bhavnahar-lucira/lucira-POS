import { useQuery } from '@tanstack/react-query';
import { getOrderDetail } from '@/services/orderService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useOrderDetail(orderId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.ORDERS.DETAIL(orderId),
    queryFn:  async () => {
      const data = await getOrderDetail(orderId);
      return data?.Entity ?? null;
    },
    enabled:   !!orderId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    order:     query.data ?? null,
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
