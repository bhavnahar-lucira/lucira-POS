import { useQuery } from '@tanstack/react-query';
import { getAtvReport } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { liveReportOptions, isFirstLoad } from '@/hooks/reports/liveReportOptions';

export function useAtvReport({ companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.ATV(params),
    queryFn:  () => getAtvReport(params),
    enabled:  enabled && !!companyIds?.length && !!fromDate && !!toDate,
    ...liveReportOptions(toDate),
    retry: false,
  });

  return {
    rows:      query.data ?? [],
    isLoading: isFirstLoad(query),
    isRefreshing: query.isFetching && query.data !== undefined,
    updatedAt: query.dataUpdatedAt,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
