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
      // Same payment_method/payment_reference shape as orderTracking.js's
      // trackDocumentPlaced (Invoice/Order) — reported directly that payment
      // mode + reference number should be captured for WebEngage "everywhere
      // the payment is used", not just checkout. Read from
      // scheme_receipt_details[] (the literal rows actually submitted to
      // SchemeReceipt/Create — see buildSchemeReceiptPayload), not from any
      // raw form field, for the same "always what OrnaVerse recorded"
      // guarantee.
      const receiptRows = variables?.scheme_receipt_details ?? [];
      const paymentMethod = receiptRows.length === 1 ? (receiptRows[0].mode_name || null) : null;
      const paymentReference = receiptRows.length === 1 ? (receiptRows[0].ref_no || null) : null;
      tracker.track(EVENTS.SCHEME_PAYMENT_RECORDED, {
        schemeEnrollmentId: variables?.scheme_enrollment_id,
        amount:             variables?.amount,
        payment_method:     paymentMethod,
        payment_reference:  paymentReference,
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
