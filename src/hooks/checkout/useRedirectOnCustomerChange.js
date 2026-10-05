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