import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { registerWalkIn } from '@/services/crmService';
import { normalizeCrmLead, normalizeWalkInCustomer } from '@/lib/normalizers/customer';
import { logWalkIn } from '@/hooks/customer/useWalkInLookup';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { selectActiveStoreId, selectActiveStoreName, selectActiveStoreCode } from '@/store/slices/storeSlice';
import TOAST from '@/constants/toastMessages';

export function useWalkInRegister() {
  const queryClient = useQueryClient();
  const companyId = useSelector(selectActiveStoreId);
  const companyName = useSelector(selectActiveStoreName);
  const companyCode = useSelector(selectActiveStoreCode);

  return useMutation({
    mutationFn: (payload) => registerWalkIn(payload),
    onSuccess: (data) => {
      toast.success(TOAST.WALKIN.REGISTERED);
      const walkInCustomer = normalizeWalkInCustomer(data?.Customer);
      const mobile = data?.Customer?.mobile;
      if (walkInCustomer && mobile) logWalkIn({ mobile, customer: walkInCustomer, companyId, companyName, companyCode });
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
