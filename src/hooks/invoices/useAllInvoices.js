import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getInvoiceList } from '@/services/orderService';
import { normalizeInvoice } from '@/hooks/invoices/useInvoiceList';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useAllInvoices({ enabled = true } = {}) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const activeStoreId   = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey: QUERY_KEYS.INVOICES.ALL(activeStoreId),
    queryFn: async () => {
      const data     = await getInvoiceList({ take: 0, skip: 0, company_id: activeStoreId });
      const entities = data?.Entities ?? [];
      return entities.map(normalizeInvoice).filter(Boolean);
    },
    enabled:   enabled && isAuthenticated && !!activeStoreId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    allInvoices: query.data ?? [],
    isLoading:   query.isLoading,
    isFetching:  query.isFetching,
    isError:     query.isError,
  };
}