import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { getStoreReadyToInvoiceLines } from '@/services/orderFulfillmentService';

export const READY_TO_BILL_KEY = (companyId) => ['orders', 'ready-to-bill', companyId];

/** Orders at the active store with a piece ready to invoice (e.g. reserved by a stock allocation), keyed by order no. */
export function useReadyToBillOrders() {
  const companyId = useSelector(selectActiveStoreId);
  const query = useQuery({
    queryKey: READY_TO_BILL_KEY(companyId),
    queryFn: () => getStoreReadyToInvoiceLines({ companyId }),
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
  const byOrder = new Map();
  for (const line of query.data ?? []) {
    const list = byOrder.get(line.document_no) ?? [];
    list.push(line);
    byOrder.set(line.document_no, list);
  }
  return { byOrder, isLoading: query.isLoading };
}
