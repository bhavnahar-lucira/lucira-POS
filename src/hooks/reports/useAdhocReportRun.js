import { useQuery } from '@tanstack/react-query';
import { runAdhocReport } from '@/services/adhocReportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useAdhocReportRun(adhocReportId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.ADHOC_REPORTS.RUN(adhocReportId),
    queryFn:  () => runAdhocReport({ adhocReportId }),
    enabled:  !!adhocReportId,
    staleTime: APP_CONFIG.STALE_TIME.ANALYTICS,
  });

  return {
    columns:   query.data?.columns ?? [],
    rows:      query.data?.rows ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
