import { useQuery } from '@tanstack/react-query';
import { getPosDashboard } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { liveReportOptions, isFirstLoad } from '@/hooks/reports/liveReportOptions';

export function usePosDashboardReport({ companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.POS_DASHBOARD(params),
    queryFn:  () => getPosDashboard(params),
    enabled:  enabled && !!companyIds?.length && !!fromDate && !!toDate,
    ...liveReportOptions(toDate),
  });

  return {
    data:      query.data ?? null,
    isLoading: isFirstLoad(query),
    isRefreshing: query.isFetching && query.data !== undefined,
    updatedAt: query.dataUpdatedAt,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
