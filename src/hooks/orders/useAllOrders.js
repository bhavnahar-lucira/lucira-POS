import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { fetchStoreScopedDocuments } from '@/services/crossStoreDocuments';
import { normalizeCustomerOrder } from '@/hooks/customer/useCustomerOrders';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {{ enabled?: boolean, staleTime?: number, refetchOnWindowFocus?: boolean }} [options]
 */
export function useAllOrders({ enabled = true, staleTime, refetchOnWindowFocus } = {}) {
  const activeStoreId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey: QUERY_KEYS.ORDERS.LIST({ skip: 0, take: 0, companyId: activeStoreId }),
    queryFn: async () => {
      const [ordersRes, invoicesRes] = await Promise.all([
        fetchStoreScopedDocuments({ kind: 'order',   companyId: activeStoreId }),
        fetchStoreScopedDocuments({ kind: 'invoice', companyId: activeStoreId }),
      ]);
      const orderEntities   = ordersRes.entities;
      const invoiceEntities = invoicesRes.entities;

      const orders   = orderEntities.map((e) => normalizeCustomerOrder(e, 'order')).filter(Boolean);
      const invoices = invoiceEntities.map((e) => normalizeCustomerOrder(e, 'invoice')).filter(Boolean);
      const merged = [...orders, ...invoices].sort(
        (a, b) => new Date(b.orderDate ?? 0) - new Date(a.orderDate ?? 0)
      );

      return merged.filter((o) => o.companyId === activeStoreId);
    },
    enabled: enabled && !!activeStoreId,
    staleTime: staleTime ?? APP_CONFIG.STALE_TIME.ORDERS,
    ...(refetchOnWindowFocus != null ? { refetchOnWindowFocus } : {}),
  });

  return {
    allOrders:  query.data ?? [],
    isLoading:  query.isLoading,
    isFetching: query.isFetching,
    isError:    query.isError,
    refetch:    query.refetch,
  };
}
