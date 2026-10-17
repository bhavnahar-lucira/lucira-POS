import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { walkInLookup } from '@/services/customerService';
import { normalizeWalkInCustomer } from '@/lib/normalizers/customer';
import { selectActiveStoreId, selectActiveStoreName, selectActiveStoreCode } from '@/store/slices/storeSlice';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import { QUERY_KEYS } from '@/constants/queryKeys';

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
  const queryClient   = useQueryClient();
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
        partyId:        data?.Customer?.party_id ?? null,
      };
    },
    onSuccess: (result, mobile) => {
      if (!result.walkInRecorded) return;
      if (result.customer) {
        logWalkIn({ mobile, customer: result.customer, companyId, companyName, companyCode });
      }
      // This records a real visit server-side (and sometimes a new
      // unregistered lead) EVERY time a customer is searched/attached
      // anywhere in the app, not just from the Walk-ins page — confirmed
      // 2026-10-16: without this, the Walk-ins page's Visit Log/Leads tabs
      // only picked up the new row once their 5-min staleTime happened to
      // expire, which read as "stuck until a hard refresh" to anyone using
      // the app normally (no manual way to force React Query to drop its
      // in-memory cache short of reloading the page).
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CRM.VISITS(companyId) });
      if (!result.partyId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CRM.LEADS() });
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
