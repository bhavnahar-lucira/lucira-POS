import { useQuery } from '@tanstack/react-query';
import { getSalesPersonWiseSales } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useSalesPersonWiseSalesReport({ companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: [...QUERY_KEYS.REPORTS.SALES_PERSON_WISE_SALES(params), 'with-counts-flag'],
    queryFn:  () => getSalesPersonWiseSales(params),
    enabled:  enabled && !!companyIds?.length && !!fromDate && !!toDate,
    staleTime: APP_CONFIG.STALE_TIME.ANALYTICS,
    refetchOnWindowFocus: false,
  });

  return {
    rows:      query.data?.rows ?? [],
    countsAvailable: query.data?.countsAvailable ?? true,
    isLoading: query.isFetching, // never show stale numbers while fresh ones load
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
