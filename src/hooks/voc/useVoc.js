import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listVoc, getVoc, createVoc, updateVoc, deleteVoc, getVocToday, listVocReferrals, listVocSkips,
} from '@/services/vocService';
import { QUERY_KEYS } from '@/constants/queryKeys';

const VOC_STALE_MS = 60 * 1000;
export const VOC_PAGE_SIZE = 50;

/** Feedback for the filters, one page at a time; the summary comes with the first page. */
export function useVocResponses(filters, { mobiles = false, enabled = true } = {}) {
  const query = useInfiniteQuery({
    queryKey: QUERY_KEYS.VOC.LIST({ ...filters, mobiles }),
    queryFn: ({ pageParam }) => listVoc(filters, { skip: pageParam, limit: VOC_PAGE_SIZE, mobiles }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip ?? undefined,
    enabled,
    staleTime: VOC_STALE_MS,
  });

  const firstPage = query.data?.pages[0];
  return {
    responses: query.data?.pages.flatMap((p) => p.rows) ?? [],
    total: firstPage?.total ?? 0,
    summary: firstPage?.summary ?? null,
    hasMore: !!query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useVocResponse(id) {
  return useQuery({
    queryKey: QUERY_KEYS.VOC.DETAIL(id),
    queryFn: () => getVoc(id),
    enabled: !!id,
  });
}

/** Whether the customer already gave feedback here today, and the Q7 pre-fill from today's purchases. */
export function useVocToday(partyId, { enabled = true } = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.VOC.TODAY(partyId),
    queryFn: () => getVocToday(partyId),
    enabled: enabled && !!partyId,
    staleTime: 0,
  });
}

export function useVocReferrals(filters, { enabled = true } = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.VOC.REFERRALS(filters),
    queryFn: () => listVocReferrals(filters),
    enabled,
    staleTime: VOC_STALE_MS,
  });
}

export function useVocSkips(filters, { enabled = true } = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.VOC.SKIPS(filters),
    queryFn: () => listVocSkips(filters),
    enabled,
    staleTime: VOC_STALE_MS,
  });
}

function useVocMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.VOC.ALL() }),
  });
}

export const useCreateVoc = () => useVocMutation(createVoc);
export const useUpdateVoc = () => useVocMutation(({ id, ...payload }) => updateVoc(id, payload));
export const useDeleteVoc = () => useVocMutation(deleteVoc);
