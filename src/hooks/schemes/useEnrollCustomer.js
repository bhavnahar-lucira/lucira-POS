// Enroll the attached customer into a jewellery savings scheme.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createSchemeEnrollment } from '@/services/schemeService';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

export function useEnrollCustomer() {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (payload) => createSchemeEnrollment(payload),

    onSuccess: (data, variables) => {
      toast.success(TOAST.SCHEMES.ENROLLED);
      tracker.track(EVENTS.SCHEME_ENROLLED, {
        transactionId: data?.EntityId,
        schemeId:      variables?.scheme_id,
        amount:        variables?.scheme_amount,
        tenure:        variables?.tenure,
        ...sessionCtx,
      });
      // Bust all enrollment caches — storeId-scoped and customer-scoped
      queryClient.invalidateQueries({ queryKey: ['schemes'] });
    },

    onError: (error, variables) => {
      toast.error(TOAST.SCHEMES.ENROLL_FAILED);
      tracker.track(EVENTS.SCHEME_ENROLL_FAILED, {
        error:    error?.message ?? 'unknown',
        schemeId: variables?.scheme_id,
        amount:   variables?.scheme_amount,
        tenure:   variables?.tenure,
        ...sessionCtx,
      });
    },
  });
}
