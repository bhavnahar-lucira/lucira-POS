// Live walk-in leads list — Services/CRM/Customer/List, fetched directly
// every time (no local DB — see crmService.js's own header for why this
// endpoint, not WalkIn's own module, is the real listing source).
// Tenant-wide, not store-scoped (CRM.Customer carries no company_id of its
// own — a lead is who they are, not which store logged them).
//
// CONFIRMED LIVE 2026-09-28: this is the tenant's FULL CRM history (3,926
// rows on this tenant, no server-side filter available) — most rows already
// carry a party_id, meaning OrnaVerse already converted them into a real
// billing customer. Filtered here to rows with NO party_id — a genuinely
// still-open lead.
//
// FIXED 2026-09-28 (reported: clicking the Leads tab broke the page) —
// this used to request Take:0 ("fetch all", confirmed live for this
// endpoint), pulling all 3,926 rows with their full nested customer_visits/
// customer_activities/customer_feedback arrays in one response and hanging
// the tab. Capped to a bounded window instead — the real, honest trade-off
// this makes: a lead created a while back, beyond this window, won't show
// up here. Raise LEADS_FETCH_CAP if that's a problem in practice; there's no
// server-side "only open leads" filter to ask for instead (no EqualityFilter
// support for "party_id is null").

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
