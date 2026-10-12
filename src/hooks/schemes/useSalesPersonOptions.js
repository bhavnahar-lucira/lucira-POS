import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { getEmployeesByCompany } from '@/services/hrService';

export function useSalesPersonOptions(companyId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.HR.EMPLOYEES_BY_COMPANY(companyId),
    queryFn: async () => {
      const response = await getEmployeesByCompany(companyId);
      return response?.Entities ?? [];
    },
    enabled: !!companyId,
    // Used directly at checkout for sales_person_id — must always reflect
    // live state (see useCheckoutPricing/useActivePromotions/
    // useRetrieveCustomer for the same reasoning elsewhere in checkout).
    staleTime: 0,
  });

  return {
    salesPersons: query.data ?? [],
    isLoading:    query.isLoading,
    isError:      query.isError,
    error:        query.error,
  };
}