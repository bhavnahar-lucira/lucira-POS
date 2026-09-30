// Registers a walk-in lead via the real Services/POS/WalkIn/Register — a
// CRM-level lead (customer_id), never a party_id/billing customer. See
// crmService.js's own header for the confirmed request shape and why leads
// registered here show up in useCrmLeads (same underlying CRM.Customer table).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { registerWalkIn } from '@/services/crmService';
import { normalizeCrmLead } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';

export function useWalkInRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => registerWalkIn(payload),
    // Reported directly (2026-09-30): a freshly registered walk-in wasn't
    // showing up in the Leads tab. Root cause — useCrmLeads.js's own
    // Customer/List call has no server-side sort and is capped to a 500-row
    // window over a several-thousand-row tenant table, so a brand-new row
    // isn't guaranteed to land in what gets fetched back. WalkIn/Register's
    // OWN response already returns the complete new row (confirmed via
    // OrnaVerse's own apidog schema) — seed the leads cache with it directly
    // instead of hoping a Customer/List refetch happens to catch it.
    onSuccess: (data) => {
      toast.success(TOAST.WALKIN.REGISTERED);
      const lead = normalizeCrmLead(data?.Customer);
      // Same invariant useCrmLeads.js's own queryFn enforces on every other
      // row in this cache — a lead with a party_id is already a converted
      // billing customer, not an open lead.
      if (lead && !lead.partyId) {
        queryClient.setQueryData(QUERY_KEYS.CRM.LEADS(), (existing) => [lead, ...(existing ?? [])]);
      }
    },
    onError: (error) => {
      toast.error(error?.serverMessage ?? TOAST.WALKIN.REGISTER_FAILED);
    },
  });
}
