// Registers a walk-in lead via the real Services/POS/WalkIn/Register — a
// CRM-level lead (customer_id), never a party_id/billing customer. See
// crmService.js's own header for the confirmed request shape and why leads
// registered here show up in useCrmLeads (same underlying CRM.Customer table).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { registerWalkIn } from '@/services/crmService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';

export function useWalkInRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => registerWalkIn(payload),
    onSuccess: () => {
      toast.success(TOAST.WALKIN.REGISTERED);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CRM.LEADS() });
    },
    onError: (error) => {
      toast.error(error?.serverMessage ?? TOAST.WALKIN.REGISTER_FAILED);
    },
  });
}
