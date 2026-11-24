// src/hooks/frejun/useFrejunCalls.js
import { useQuery } from '@tanstack/react-query';
import { getFrejunCalls } from '@/services/frejunService';
import { QUERY_KEYS } from '@/constants/queryKeys';

export function useFrejunCalls(params = {}, { enabled = true, refetchInterval = false } = {}) {
  const {
    page = 1,
    pageSize = 50,
    search = '',
    candidateNumber = '',
    userEmail = '',
    store = '',
    dateStart = '',
    dateEnd = '',
    callId = '',
    tag = '',
  } = params;

  const queryParams = {
    page,
    pageSize,
    search: search.trim(),
    candidateNumber: candidateNumber.trim(),
    userEmail: userEmail.trim(),
    store: store.trim(),
    dateStart: dateStart.trim(),
    dateEnd: dateEnd.trim(),
    callId: callId.trim(),
    tag: tag.trim(),
  };

  const query = useQuery({
    queryKey: QUERY_KEYS.FREJUN.CALLS(queryParams),
    queryFn: () => getFrejunCalls(queryParams),
    enabled,
    staleTime: 10 * 1000,
    refetchInterval,
    placeholderData: (previousData) => previousData,
  });

  const rawData = query.data;
  const calls = rawData?.results ?? [];
  const count = rawData?.count ?? 0;
  const pageCount = rawData?.pageCount ?? calls.length;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return {
    calls,
    count,
    pageCount,
    totalPages,
    hasNext: Boolean(rawData?.next),
    hasPrevious: Boolean(rawData?.previous),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updatedAt: query.dataUpdatedAt,
  };
}
