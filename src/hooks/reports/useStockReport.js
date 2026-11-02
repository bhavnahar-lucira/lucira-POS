import { useQuery } from '@tanstack/react-query';
import { getStockReport } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useStockReport({ companyIds, toDate, enabled = true }) {
  const params = { companyIds, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.STOCK(params),
    queryFn:  () => getStockReport(params),
    enabled:  enabled && !!companyIds?.length && !!toDate,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
    refetchOnWindowFocus: false,
  });

  return {
    rows:      query.data ?? [],
    isLoading: query.isFetching, // never show stale numbers while fresh ones load
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
