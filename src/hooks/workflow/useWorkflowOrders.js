// src/hooks/workflow/useWorkflowOrders.js
import { useQuery } from '@tanstack/react-query';
import { fetchWorkflowOrders } from '@/services/workflowOrderService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useWorkflowOrders(params = {}, { enabled = true } = {}) {
  const {
    search = '',
    query = '',
    order_number = '',
    po_number = '',
    document_no = '',
    step = 'all',
    status = '',
    from_date = '',
    to_date = '',
    store = '',
    page = 1,
    pageSize = 50,
  } = params;

  const limit = pageSize;
  const offset = Math.max(0, (page - 1) * pageSize);

  const queryParams = {
    search: (search || query || '').trim(),
    order_number: (order_number || '').trim(),
    po_number: (po_number || '').trim(),
    document_no: (document_no || '').trim(),
    step: (step || 'all').trim(),
    status: (status || '').trim(),
    from_date: (from_date || '').trim(),
    to_date: (to_date || '').trim(),
    store: (store || '').trim(),
    limit,
    offset,
  };

  const queryResult = useQuery({
    queryKey: QUERY_KEYS.WORKFLOW_ORDERS.LIST(queryParams),
    queryFn: () => fetchWorkflowOrders(queryParams),
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: (previousData) => previousData,
  });

  const responseData = queryResult.data;
  const orders = responseData?.data ?? [];
  const meta = responseData?.meta ?? {
    total: 0,
    limit,
    offset,
    returned: 0,
  };
  const total = meta.total ?? orders.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    orders,
    meta,
    total,
    totalPages,
    page,
    pageSize,
    isLoading: queryResult.isLoading,
    isFetching: queryResult.isFetching,
    error: queryResult.error,
    refetch: queryResult.refetch,
    updatedAt: queryResult.dataUpdatedAt,
  };
}
