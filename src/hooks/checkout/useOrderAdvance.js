import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { selectFulfillmentOrderId, selectFulfillmentOrderNo } from '@/store/slices/cartSlice';
import { getOrderAdvance } from '@/services/orderFulfillmentService';
import { QUERY_KEYS } from '@/constants/queryKeys';

/** The advance already paid on the order being billed ("Fulfill from Order"), or null. */
export function useOrderAdvance({ enabled = true } = {}) {
  const storeOrderId = useSelector(selectFulfillmentOrderId);
  const orderNo = useSelector(selectFulfillmentOrderNo);
  const orderId = enabled ? storeOrderId : null;
  const query = useQuery({
    queryKey: QUERY_KEYS.ORDER_FULFILLMENT.ADVANCE(orderId),
    queryFn:  () => getOrderAdvance({ orderId, orderNo }),
    enabled:  !!orderId,
    staleTime: 0,
    gcTime:    0,
    retry:     false,
  });
  return { orderAdvance: orderId ? (query.data ?? null) : null, isLoading: !!orderId && query.isLoading };
}
