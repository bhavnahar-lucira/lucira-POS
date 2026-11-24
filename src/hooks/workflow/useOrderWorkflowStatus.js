import { useQuery } from '@tanstack/react-query';
import { fetchWorkflowStatuses, fetchWorkflowOrderByDocument } from '@/services/workflowOrderService';
import { QUERY_KEYS } from '@/constants/queryKeys';

// The workflow panel moves orders between stages outside the POS; refresh while the page is open.
const WORKFLOW_REFRESH_MS = 60 * 1000;

/** Current workflow stage for each listed OrnaVerse order no. (one request for the whole list). */
export function useWorkflowStatuses(docNos = []) {
  const keys = [...new Set(docNos.filter(Boolean))].sort();
  const query = useQuery({
    queryKey: QUERY_KEYS.WORKFLOW_ORDERS.STATUSES(keys),
    queryFn: () => fetchWorkflowStatuses(keys),
    enabled: keys.length > 0,
    staleTime: 30 * 1000,
    refetchInterval: WORKFLOW_REFRESH_MS,
    placeholderData: (prev) => prev,
  });
  return { statuses: query.data ?? {}, isLoading: keys.length > 0 && (query.isLoading || query.isPlaceholderData) };
}

/** The full workflow order for one OrnaVerse order no. */
export function useWorkflowOrderByDocument(docNo, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: QUERY_KEYS.WORKFLOW_ORDERS.BY_DOCUMENT(docNo),
    queryFn: () => fetchWorkflowOrderByDocument(docNo),
    enabled: enabled && !!docNo,
    staleTime: 30 * 1000,
    refetchInterval: WORKFLOW_REFRESH_MS,
  });
  return { workflowOrder: query.data ?? null, isLoading: query.isLoading, error: query.error };
}
