import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { registerWalkIn } from '@/services/crmService';
import { normalizeCrmLead } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';

export function useWalkInRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => registerWalkIn(payload),
    onSuccess: (data) => {
      toast.success(TOAST.WALKIN.REGISTERED);
      const lead = normalizeCrmLead(data?.Customer);
      if (lead && !lead.partyId) {
        queryClient.setQueryData(QUERY_KEYS.CRM.LEADS(), (existing) => [lead, ...(existing ?? [])]);
      }
    },
    onError: (error) => {
      toast.error(error?.serverMessage ?? TOAST.WALKIN.REGISTER_FAILED);
    },
  });
}
