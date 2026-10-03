// No Post step — Create is terminal per API design. No customer is ever
// attached for a daily closing (it's an agent/store-level action, not a
// customer transaction), so useSessionTrackingContext's customer_id always
// reads 'guest' here — that's expected, not a gap.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createDailyClosing } from '@/services/dailyClosingService';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

export function useCreateDailyClosing() {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (closingEntity) => createDailyClosing(closingEntity),

    onSuccess: (_, variables) => {
      toast.success(TOAST.DAILY_CLOSING.CREATED);
      tracker.track(EVENTS.DAILY_CLOSING_CREATED, {
        totalSales: variables?.total_sales,
        cashSales:  variables?.cash_sales,
        cardSales:  variables?.card_sales,
        upiSales:   variables?.upi_sales,
        ...sessionCtx,
      });
      queryClient.invalidateQueries({ queryKey: ['daily-closing'] });
    },

    onError: (error, variables) => {
      toast.error(TOAST.DAILY_CLOSING.CREATE_FAILED);
      tracker.track(EVENTS.DAILY_CLOSING_FAILED, {
        error:      error?.message ?? 'unknown',
        totalSales: variables?.total_sales,
        ...sessionCtx,
      });
    },
  });
}
