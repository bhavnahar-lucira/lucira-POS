// Record a monthly scheme instalment payment from a customer.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createSchemeReceipt } from '@/services/schemeService';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

export function useSchemeReceipt() {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (payload) => createSchemeReceipt(payload),

    onSuccess: (_, variables) => {
      toast.success(TOAST.SCHEMES.RECEIPT_SUCCESS);
      tracker.track(EVENTS.SCHEME_PAYMENT_RECORDED, {
        schemeEnrollmentId: variables?.scheme_enrollment_id,
        amount:             variables?.amount,
        ...sessionCtx,
      });
      // Bust receipts for this enrollment + enrollment list
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.SCHEMES.RECEIPT_LIST(variables.scheme_enrollment_id),
      });
      queryClient.invalidateQueries({ queryKey: ['schemes'] });
    },

    onError: (error, variables) => {
      toast.error(TOAST.SCHEMES.RECEIPT_FAILED);
      tracker.track(EVENTS.SCHEME_PAYMENT_FAILED, {
        error: error?.message ?? 'unknown',
        schemeEnrollmentId: variables?.scheme_enrollment_id,
        amount:             variables?.amount,
        ...sessionCtx,
      });
    },
  });
}
