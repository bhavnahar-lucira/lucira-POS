import { useQuery } from '@tanstack/react-query';
import { getSummaryBillCounts } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useSummaryBillCounts({ companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.SUMMARY_BILLS(params),
    queryFn:  () => getSummaryBillCounts(params),
    enabled:  enabled && !!companyIds?.length && !!fromDate && !!toDate,
    staleTime: APP_CONFIG.STALE_TIME.ANALYTICS,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    data:      query.data ?? null,
    isLoading: query.isFetching,
    isError:   query.isError,
  };
}
