import { useQuery } from '@tanstack/react-query';
import { retrieveCustomer } from '@/services/customerService';
import { normalizeCustomer } from '@/lib/normalizers/customer';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { useSelector } from 'react-redux';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useRetrieveCustomer(partyId, { enabled = true } = {}) {
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const query = useQuery({
    queryKey: QUERY_KEYS.CUSTOMERS.RETRIEVE(partyId),
    queryFn:  async () => {
      const response = await retrieveCustomer(partyId);
      const entity   = response?.data?.Entity ?? null;
      return entity ? normalizeCustomer(entity) : null;
    },
    enabled:   enabled && isAuthenticated && !!partyId,
    staleTime: APP_CONFIG.STALE_TIME.CUSTOMER,
  });

  return {
    customer:  query.data    ?? null,
    isLoading: query.isLoading,
    isFetching:query.isFetching,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}