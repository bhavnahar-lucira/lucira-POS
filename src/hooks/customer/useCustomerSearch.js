// src/hooks/customer/useCustomerSearch.js
// Live, API-backed partial search (name OR mobile) — replaces filtering a
// locally-cached directory snapshot (see useAllCustomers.js), per explicit
// direction (2026-09-28): every partial search should hit Customer/List's
// real ContainsText filter directly, for accurate, always-current results
// rather than whatever happened to be cached up to STALE_TIME.STATIC ago.

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
