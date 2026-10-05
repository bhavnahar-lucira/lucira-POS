import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getCustomerList } from '@/services/customerService';
import { normalizeCustomer } from '@/lib/normalizers/customer';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useCustomerSearch(containsText, { enabled = true } = {}) {
  const activeStoreId   = useSelector(selectActiveStoreId);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const trimmed = (containsText ?? '').trim();

  const query = useQuery({
    queryKey: QUERY_KEYS.CUSTOMERS.SEARCH(activeStoreId, trimmed),
    queryFn: async () => {
      const data = await getCustomerList({
        take: APP_CONFIG.PAGINATION.CUSTOMERS_ALL_TAKE,
        skip: 0,
        companyId: activeStoreId,
        containsText: trimmed,
      });
      const entities = data?.Entities ?? [];
      return entities.map(normalizeCustomer).filter(Boolean);
    },
    enabled: enabled && isAuthenticated && !!activeStoreId && !!trimmed,
    staleTime: APP_CONFIG.STALE_TIME.CUSTOMER,
  });

  return {
    results:    query.data ?? [],
    isLoading:  query.isFetching,
    isError:    query.isError,
  };
}
