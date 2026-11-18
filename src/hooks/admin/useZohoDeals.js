import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { selectActiveStoreId } from '@/store/slices/storeSlice';

/**
 * Hook to fetch paginated Zoho CRM deals with filters.
 * Store logins get only their own store's records (enforced by the API).
 *
 * @param {{
 *   page?: number,
 *   perPage?: number,
 *   store?: string,
 *   stage?: string,
 *   search?: string,
 * }} params
 * @param {object} options
 */
export function useZohoDeals(params = {}, options = {}) {
  const activeStoreId = useSelector(selectActiveStoreId);
  const {
    page = 1,
    perPage = 50,
    store = 'all',
    stage = 'all',
    search = '',
    fromDate = '',
    toDate = '',
  } = params;

  return useQuery({
    queryKey: ['admin', 'zoho-deals', activeStoreId, { page, perPage, store, stage, search, fromDate, toDate }],
    queryFn: async () => {
      const q = new URLSearchParams({
        page:     String(page),
        perPage:  String(perPage),
        store:    store || 'all',
        stage:    stage || 'all',
        search:   search?.trim() || '',
        fromDate: fromDate || '',
        toDate:   toDate || '',
      });
      const res = await fetch(`/api/admin/deals?${q.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to fetch deals (${res.status})`);
      }
      return res.json();
    },
    enabled: options.enabled ?? true,
    staleTime: 60 * 1000, // 1 minute
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch a single Zoho CRM deal by ID.
 * @param {string} dealId
 * @param {object} options
 */
export function useZohoDealDetail(dealId, options = {}) {
  const activeStoreId = useSelector(selectActiveStoreId);

  return useQuery({
    queryKey: ['admin', 'zoho-deal', activeStoreId, dealId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals/${dealId}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to fetch deal (${res.status})`);
      }
      const data = await res.json();
      return data?.deal ?? null;
    },
    enabled: !!dealId && (options.enabled ?? true),
    staleTime: 2 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
