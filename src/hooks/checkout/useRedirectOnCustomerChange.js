// src/hooks/checkout/useRedirectOnCustomerChange.js
// Shared guard for /cart and /checkout: if the attached customer session
// changes (switched or detached) after the page has mounted, redirect to
// /catalog. In-progress cart/checkout state is tied to the customer it
// was built for, so a session change forces a clean restart of the flow.
//
// Attaching a customer for the FIRST time on this page (guest -> attached)
// is the normal flow and does NOT trigger a redirect — only a subsequent
// switch/detach of an already-attached customer does.
//
// A toast explains the redirect for educational purposes — this is
// expected behavior, not a bug, if an agent sees it after switching
// customers mid-journey.

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import TOAST from '@/constants/toastMessages';

export function useRedirectOnCustomerChange(enabled = true) {
  const router = useRouter();
  const { customerId } = useCustomerSession();
  const initialCustomerIdRef = useRef(customerId);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    if (!hasMountedRef.current) {
      // First run after mount — record the customer this page started with.
      hasMountedRef.current = true;
      initialCustomerIdRef.current = customerId;
      return;
    }

    const initialCustomerId = initialCustomerIdRef.current;

    // Only redirect if the page started with an attached customer and that
    // customer has now changed (switched or detached). If the page started
    // with no customer attached (guest), attaching one for the first time
    // is the normal flow — not a "switch" — so don't redirect, but update
    // the baseline so a *subsequent* switch is correctly detected.
    if (initialCustomerId === null) {
      if (customerId !== null) {
        initialCustomerIdRef.current = customerId;
      }
      return;
    }

    if (customerId !== initialCustomerId) {
      toast.info(TOAST.CUSTOMER.SESSION_CHANGED_REDIRECT);
      router.replace('/catalog');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, enabled]);
}