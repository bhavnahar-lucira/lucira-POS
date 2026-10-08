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
        found:          !!data?.Customer,
        customer:       normalizeWalkInCustomer(data?.Customer),
        // CONFIRMED LIVE 2026-10-08: the server's own dedup (one walk-in per
        // customer per 4 hours) means a successful, found-customer lookup
        // very often does NOT create a new visit row — WalkInRecorded:false
        // + Message explains why. The UI must reflect this distinction
        // instead of always claiming "visit recorded".
        walkInRecorded: !!data?.WalkInRecorded,
        message:        data?.Message ?? null,
      };
    },
    onSuccess: (result, mobile) => {
      if (result.walkInRecorded && result.customer) {
        logWalkIn({ mobile, customer: result.customer, companyId, companyName, companyCode });
      }
    },
    onError: (error) => {
      // Fire-and-forget by design (never blocks attach/search UX) — but a
      // silent failure here was the confirmed root cause of "visit not
      // recorded" reports, so at least surface it for diagnosis.
      console.warn('[useWalkInLookup] walk-in lookup/record failed:', error?.serverMessage ?? error?.message);
    },
  });

  return {
    lookup:    mutation.mutate,
    result:    mutation.data ?? null,
    isLoading: mutation.isPending,
    reset:     mutation.reset,
  };
}
