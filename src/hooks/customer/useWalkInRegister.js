import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { registerWalkIn } from '@/services/crmService';
import { normalizeCrmLead } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import TOAST from '@/constants/toastMessages';

export function useWalkInRegister() {
  const queryClient = useQueryClient();
  const companyId = useSelector(selectActiveStoreId);

  return useMutation({
    mutationFn: (payload) => registerWalkIn(payload),
    onSuccess: (data) => {
      toast.success(TOAST.WALKIN.REGISTERED);
      const lead = normalizeCrmLead(data?.Customer);
      if (lead && !lead.partyId) {
        queryClient.setQueryData(QUERY_KEYS.CRM.LEADS(), (existing) => [lead, ...(existing ?? [])]);
      }
      // WalkIn/Register also writes a visit row (data.Customer.customer_visits)
      // same as the automatic lookup path — see useWalkInLookup's invalidation.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CRM.VISITS(companyId) });
    },
    onError: (error) => {
      toast.error(error?.serverMessage ?? TOAST.WALKIN.REGISTER_FAILED);
    },
  });
}
