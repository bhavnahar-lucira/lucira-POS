// Real, live walk-in visit log — Services/CRM/CustomerVisits/List, scoped
// server-side to the active store via EqualityFilter (CONFIRMED LIVE
// 2026-09-28: narrows a 3,009-row tenant-wide table down to 199 for one
// store). Replaces the old Mongo-backed walkins_POS log entirely (explicit
// direction: no DB for walk-in data) — every row here is real OrnaVerse
// visit history, not just the subset this app happened to catch via a
// mobile-search match.

import { useQuery } from '@tanstack/react-query';
import { getCustomerVisits } from '@/services/crmService';
import { normalizeCrmVisit } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useCrmVisits(companyId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.CRM.VISITS(companyId),
    queryFn: async () => {
      const data = await getCustomerVisits({ companyId, take: 300 });
      const entities = data?.Entities ?? [];
      return entities.map(normalizeCrmVisit).filter(Boolean)
        .sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt));
    },
    enabled: !!companyId,
    staleTime: APP_CONFIG.STALE_TIME.CUSTOMER,
  });

  return {
    visits:    query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
