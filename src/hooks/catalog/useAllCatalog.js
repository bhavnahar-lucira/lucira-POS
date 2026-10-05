import { useQuery }      from '@tanstack/react-query';
import { useSelector }   from 'react-redux';
import { useCallback, useState } from 'react';

import { QUERY_KEYS }     from '@/constants/queryKeys';
import APP_CONFIG         from '@/constants/appConfig';
import { getAllProducts, belongsToStore } from '@/services/catalogService';

const selectIsAuthenticated = (state) => state.auth.isAuthenticated;

/**
 * @param {number|null} storeId 
 * @param {{ enabled?: boolean, showOutOfStock?: boolean }} [options]
 */
export function useAllCatalog(storeId, { enabled = true, showOutOfStock = false } = {}) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [loadedCount, setLoadedCount] = useState(0);

  const queryFn = useCallback(() => {
    setLoadedCount(0);
    return getAllProducts(storeId, setLoadedCount, showOutOfStock);
  }, [storeId, showOutOfStock]);

  const query = useQuery({
    queryKey:  QUERY_KEYS.CATALOG.ALL_SHARED(showOutOfStock),
    queryFn,
    select:    useCallback((allProducts) => allProducts.filter((p) => belongsToStore(p, storeId)), [storeId]),
    enabled:   isAuthenticated && !!storeId && enabled,
    staleTime: APP_CONFIG.STALE_TIME.MASTER_DATA,
    gcTime:    APP_CONFIG.STALE_TIME.MASTER_DATA,
  });

  return { ...query, loadedCount };
}
