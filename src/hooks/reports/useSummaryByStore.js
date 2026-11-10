import { useQuery } from '@tanstack/react-query';
import { getSummaryByStore } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useSummaryByStore({ companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.SUMMARY_BY_STORE(params),
    queryFn:  () => getSummaryByStore(params),
    enabled:  enabled && (companyIds?.length ?? 0) > 1 && !!fromDate && !!toDate,
    staleTime: APP_CONFIG.STALE_TIME.ANALYTICS,
    refetchOnWindowFocus: false,
  });

  return {
    rows:      query.data ?? [],
    isLoading: query.isFetching,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
