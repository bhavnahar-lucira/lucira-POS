import { useQuery } from '@tanstack/react-query';
import { getWalkinVisits } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useWalkinVisitsReport({ companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.WALKIN_VISITS(params),
    queryFn:  () => getWalkinVisits(params),
    enabled:  enabled && !!companyIds?.length && !!fromDate && !!toDate,
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
