import { useMemo } from 'react';
import { useAllOrders } from '@/hooks/orders/useAllOrders';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {{ skip?: number }} [options]
 */
export function useOrders({ skip = 0 } = {}) {
  const take = APP_CONFIG.PAGINATION.ORDERS_TAKE;
  const { allOrders, isLoading, isFetching, isError, refetch } = useAllOrders();

  const orders = useMemo(
    () => allOrders.slice(skip, skip + take),
    [allOrders, skip, take]
  );

  return {
    orders,
    totalCount: allOrders.length,
    take,
    isLoading,
    isFetching,
    isError,
    refetch,
  };
}
