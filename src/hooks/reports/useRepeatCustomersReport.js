import { useQuery } from '@tanstack/react-query';
import { getRepeatCustomers } from '@/services/reportsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useRepeatCustomersReport({ companyIds, fromDate, toDate, enabled = true }) {
  const params = { companyIds, fromDate, toDate };
  const query = useQuery({
    queryKey: QUERY_KEYS.REPORTS.REPEAT_CUSTOMERS(params),
    queryFn:  () => getRepeatCustomers(params),
    enabled:  enabled && !!companyIds?.length && !!fromDate && !!toDate,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
    refetchOnWindowFocus: false,
  });

  return {
    data:      query.data ?? null,
    isLoading: query.isFetching,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
