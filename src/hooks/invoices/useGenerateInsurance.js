import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { generateInsurance } from '@/services/insuranceService';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

/**
 * Issues Olocker policies for the invoice lines the customer opted in for.
 *
 * @returns mutation taking `{ transactionId, itemKeys }`
 */
export function useGenerateInsurance() {
  const queryClient = useQueryClient();
  const sessionCtx  = useSessionTrackingContext();

  return useMutation({
    mutationFn: ({ transactionId, itemKeys }) => generateInsurance({ transactionId, itemKeys }),

    onSuccess: (data, { transactionId }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.INSURANCE.BY_INVOICE(transactionId),
      });

      // The route answers 200 with issuedCount 0 when Olocker accepted the
      // call but declined every line — a success-shaped failure the
      // operator still has to see.
      if (!data?.issuedCount) {
        toast.error(data?.failures?.[0] || TOAST.INSURANCE.NONE_ISSUED);
        tracker.track(EVENTS.INSURANCE_FAILED, {
          transactionId, reason: 'none_issued', ...sessionCtx,
        });
        return;
      }

      toast.success(TOAST.INSURANCE.GENERATED(data.issuedCount));
      // Partial outcomes: lines dropped for missing data, or rows Olocker
      // itself turned down, alongside ones that succeeded.
      data.skipped?.forEach((row) => toast.warning(`${row.item_name}: ${row.reason}`));
      data.failures?.forEach((message) => toast.warning(message));

      tracker.track(EVENTS.INSURANCE_GENERATED, {
        transactionId,
        issuedCount: data.issuedCount,
        ...sessionCtx,
      });
    },

    onError: (error, { transactionId }) => {
      toast.error(
        error?.status === 409
          ? TOAST.INSURANCE.ALREADY_INSURED
          : (error?.message || TOAST.INSURANCE.FAILED),
      );
      // A 409 means the lines are already covered — worth refetching so the
      // sheet stops offering to insure them again.
      if (error?.status === 409) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.INSURANCE.BY_INVOICE(transactionId),
        });
      }
      // A 422 carries the per-line reason each item was rejected, which is
      // the only thing that tells the operator what to go and fix.
      error?.payload?.skipped?.forEach((row) =>
        toast.warning(`${row.item_name}: ${row.reason}`),
      );
      tracker.track(EVENTS.INSURANCE_FAILED, {
        transactionId,
        error: error?.code ?? error?.message ?? 'unknown',
        ...sessionCtx,
      });
    },
  });
}
