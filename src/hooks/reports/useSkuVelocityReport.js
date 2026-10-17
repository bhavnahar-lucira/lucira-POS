import { useQuery } from '@tanstack/react-query';
import { getSkuVelocity } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useSkuVelocityReport({ companyId, fromDate, toDate }) {
  const params = { companyId, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.SKU_VELOCITY(params),
    queryFn:  () => getSkuVelocity(params),
    enabled:  !!companyId && !!fromDate && !!toDate,
    staleTime: APP_CONFIG.STALE_TIME.ANALYTICS,
  });

  return {
    rows:      query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
