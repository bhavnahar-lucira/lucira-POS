import { useSelector } from 'react-redux';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { selectActiveStoreId } from '@/store/slices/storeSlice';

/**
 * @returns {{ customer_id: number|string, store_id: number|undefined }}
 */
export function useSessionTrackingContext() {
  const { customerId } = useCustomerSession();
  const activeStoreId  = useSelector(selectActiveStoreId);
  return { customer_id: customerId ?? 'guest', store_id: activeStoreId };
}
