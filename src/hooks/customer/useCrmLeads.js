import { useQuery } from '@tanstack/react-query';
import { getCrmLeads } from '@/services/crmService';
import { normalizeCrmLead } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

const LEADS_FETCH_CAP = 500;

export function useCrmLeads({ enabled = true } = {}) {
  const query = useQuery({
    queryKey: QUERY_KEYS.CRM.LEADS(),
    queryFn: async () => {
      const data = await getCrmLeads({ take: LEADS_FETCH_CAP, skip: 0 });
      const entities = data?.Entities ?? [];
      return entities.map(normalizeCrmLead).filter((lead) => lead && !lead.partyId);
    },
    enabled,
    staleTime: APP_CONFIG.STALE_TIME.CUSTOMER,
  });

  return {
    leads:     query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
