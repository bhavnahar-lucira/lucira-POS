import { useInfiniteQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export const NON_BUYERS_PAGE_SIZE = 48;

/**
 * @param {{ companyId: number, from?: string, to?: string, minVisits?: string, sort?: string, search?: string }} filters
 * @param {{ skip?: number, limit?: number, refresh?: boolean }} [page]
 */
export async function fetchNonBuyers(filters, { skip = 0, limit = NON_BUYERS_PAGE_SIZE, refresh = false } = {}) {
  const qs = new URLSearchParams({
    company_id: String(filters.companyId),
    from: filters.from ?? '',
    to: filters.to ?? '',
    minVisits: String(filters.minVisits ?? 2),
    sort: filters.sort ?? 'visits',
    search: filters.search ?? '',
    skip: String(skip),
    limit: String(limit),
    ...(refresh && { refresh: '1' }),
  });
  const res = await fetch(`/api/non-buyers?${qs}`);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Failed to load non-buyers');
  return res.json();
}

/** Non-Buyers for the active store, one page at a time — the server matches visits against purchases. */
export function useNonBuyers(filters) {
  const query = useInfiniteQuery({
    queryKey: QUERY_KEYS.CRM.NON_BUYERS(filters.companyId, filters),
    queryFn: ({ pageParam }) => fetchNonBuyers(filters, { skip: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip ?? undefined,
    enabled: !!filters.companyId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  const firstPage = query.data?.pages[0];
  return {
    nonBuyers: query.data?.pages.flatMap((p) => p.rows) ?? [],
    total: firstPage?.total ?? 0,
    pastBuyerCount: firstPage?.pastBuyerCount ?? 0,
    hasMore: !!query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    // Refresh rebuilds the server's cached result first, so it reflects the latest visits and sales.
    refresh: async () => {
      await fetchNonBuyers(filters, { limit: 1, refresh: true });
      return query.refetch();
    },
  };
}
