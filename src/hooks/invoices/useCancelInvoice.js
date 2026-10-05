import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cancelInvoice } from '@/services/orderService';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

export function useCancelInvoice() {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => cancelInvoice(transactionId),

    onSuccess: (_data, transactionId) => {
      toast.success(TOAST.INVOICES.CANCELLED);
      tracker.track(EVENTS.INVOICE_CANCELLED, { transactionId, ...sessionCtx });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },

    onError: (error, transactionId) => {
      toast.error(TOAST.INVOICES.CANCEL_FAILED);
      tracker.track(EVENTS.INVOICE_CANCEL_FAILED, {
        transactionId,
        error: error?.message ?? 'unknown',
        ...sessionCtx,
      });
    },
  });
}
