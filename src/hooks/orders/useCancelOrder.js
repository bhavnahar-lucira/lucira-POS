import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cancelOrder } from '@/services/orderService';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

export function useCancelOrder() {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (transactionId) => cancelOrder(transactionId),

    onSuccess: (_data, transactionId) => {
      toast.success(TOAST.ORDERS.CANCELLED);
      tracker.track(EVENTS.ORDER_CANCELLED, { transactionId, ...sessionCtx });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },

    onError: (error, transactionId) => {
      toast.error(TOAST.ORDERS.CANCEL_FAILED);
      tracker.track(EVENTS.ORDER_CANCEL_FAILED, {
        transactionId,
        error: error?.message ?? 'unknown',
        ...sessionCtx,
      });
    },
  });
}