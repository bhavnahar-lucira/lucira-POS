import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getCustomerList } from '@/services/customerService';
import { normalizeCustomer } from '@/lib/normalizers/customer';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useCustomerList({ skip = 0 } = {}) {
  const activeStoreId   = useSelector(selectActiveStoreId);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const take = APP_CONFIG.PAGINATION.CUSTOMERS_TAKE;

  const query = useQuery({
    queryKey: QUERY_KEYS.CUSTOMERS.LIST({ companyId: activeStoreId, skip, take }),
    queryFn:  async () => {
      const data     = await getCustomerList({ take, skip, companyId: activeStoreId });
      const entities = data?.Entities ?? [];
      return {
        customers:  entities.map(normalizeCustomer).filter(Boolean),
        totalCount: data?.TotalCount ?? 0,
      };
    },
    enabled:   isAuthenticated && !!activeStoreId,
    staleTime: APP_CONFIG.STALE_TIME.CUSTOMER,
  });

  return {
    customers:  query.data?.customers  ?? [],
    totalCount: query.data?.totalCount ?? 0,
    take,
    isLoading:  query.isLoading,
    isFetching: query.isFetching,
    isError:    query.isError,
    refetch:    query.refetch,
  };
}