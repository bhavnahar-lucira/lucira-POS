import { useQuery } from '@tanstack/react-query';
import { getCategoryWiseSales } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useCategoryWiseSalesReport({ companyId, fromDate, toDate }) {
  const params = { companyId, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.CATEGORY_WISE_SALES(params),
    queryFn:  () => getCategoryWiseSales(params),
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
