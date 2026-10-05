import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
import { getEmployeesByCompany } from '@/services/hrService';

export function useSalesPersonOptions(companyId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.HR.EMPLOYEES_BY_COMPANY(companyId),
    queryFn: async () => {
      const response = await getEmployeesByCompany(companyId);
      return response?.Entities ?? [];
    },
    enabled: !!companyId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  return {
    salesPersons: query.data ?? [],
    isLoading:    query.isLoading,
    isError:      query.isError,
    error:        query.error,
  };
}