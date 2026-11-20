import { useQuery } from '@tanstack/react-query';
import { getStoreReport } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { liveReportOptions, isFirstLoad } from '@/hooks/reports/liveReportOptions';

export function useStoreReport(report, { companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.STORE_REPORT(report, params),
    queryFn:  () => getStoreReport(report, params),
    enabled:  enabled && !!report && !!companyIds?.length && !!fromDate && !!toDate,
    ...liveReportOptions(toDate),
    retry: false,
  });

  return {
    rows:         query.data?.rows ?? [],
    sessionStoreOnly: query.data?.sessionStoreOnly ?? false,
    isLoading:    isFirstLoad(query),
    isRefreshing: query.isFetching && query.data !== undefined,
    updatedAt:    query.dataUpdatedAt,
    isError:      query.isError,
    refetch:      query.refetch,
  };
}
