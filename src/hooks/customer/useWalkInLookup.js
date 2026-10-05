import { useMutation } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { walkInLookup } from '@/services/customerService';
import { normalizeWalkInCustomer } from '@/lib/normalizers/customer';
import { selectActiveStoreId, selectActiveStoreName, selectActiveStoreCode } from '@/store/slices/storeSlice';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

function maskMobile(mobile) {
  if (!mobile) return null;
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function logWalkIn({ mobile, customer, companyId, companyName, companyCode }) {
  if (!companyId) return; 
  
  tracker.track(
    EVENTS.WALKIN_RECORDED,
    {
      store_id:               companyId,
      store_name:             companyName,
      store_code:             companyCode,
      walk_in_customer_id:    customer.walkInCustomerId,
      customer_mobile_masked: maskMobile(mobile),
    },
    {
      customer_name:   customer.name,
      customer_mobile: mobile,
    },
  );
}

export function useWalkInLookup() {
  const companyId    = useSelector(selectActiveStoreId);
  const companyName  = useSelector(selectActiveStoreName);
  const companyCode  = useSelector(selectActiveStoreCode);

  const mutation = useMutation({
    mutationFn: async (mobile) => {
      const response = await walkInLookup(mobile);
      const data = response?.data;
      return {
        found:    !!data?.Customer,
        customer: normalizeWalkInCustomer(data?.Customer),
      };
    },
    onSuccess: (result, mobile) => {
      if (result.found && result.customer) {
        logWalkIn({ mobile, customer: result.customer, companyId, companyName, companyCode });
      }
    },
  });

  return {
    lookup:    mutation.mutate,
    result:    mutation.data ?? null,
    isLoading: mutation.isPending,
    reset:     mutation.reset,
  };
}
