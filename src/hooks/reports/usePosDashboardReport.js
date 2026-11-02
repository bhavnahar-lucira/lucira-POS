import { useQuery } from '@tanstack/react-query';
import { getPosDashboard } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function usePosDashboardReport({ companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.POS_DASHBOARD(params),
    queryFn:  () => getPosDashboard(params),
    enabled:  enabled && !!companyIds?.length && !!fromDate && !!toDate,
    staleTime: APP_CONFIG.STALE_TIME.ANALYTICS,
    refetchOnWindowFocus: false,
  });

  return {
    data:      query.data ?? null,
    isLoading: query.isFetching, // never show stale numbers while fresh ones load
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
