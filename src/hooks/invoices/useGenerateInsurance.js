import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { generateInsurance } from '@/services/insuranceService';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import { QUERY_KEYS } from '@/constants/queryKeys';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import { OLOCKER_MAX_TAGS_PER_REQUEST } from '@/lib/olocker/constants';

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Errors that mean "stop now": the invoice is latched (an earlier request's
// outcome is unknown), Olocker timed out on this batch, or Olocker itself is
// down / misconfigured. Sending the next batch would only repeat the failure
// or, worse, buy a policy on top of one we can't see.
const STOP_CODES = new Set([
  'UNATTRIBUTED', 'TIMEOUT', 'UNREACHABLE', 'AUTH_FAILED', 'NOT_CONFIGURED', 'HTTP_ERROR', 'BAD_RESPONSE',
]);

/**
 * Issues Olocker policies for the invoice lines the customer opted in for.
 *
 * Sent in requests of OLOCKER_MAX_TAGS_PER_REQUEST items; the route splits
 * each into small Olocker calls that run side by side (a single 6-item
 * TagList ran past the timeout on live, while 1–2 items go through). Every
 * call is recorded server-side the moment it succeeds, so a failure
 * part-way keeps everything issued before it and the operator sees exactly
 * which part failed.
 *
 * @returns mutation taking `{ transactionId, itemKeys, onProgress? }`
 *   onProgress({ done, total }) fires before each batch is sent.
 */
export function useGenerateInsurance() {
  const queryClient = useQueryClient();
  const sessionCtx  = useSessionTrackingContext();

  return useMutation({
    mutationFn: async ({ transactionId, itemKeys, onProgress }) => {
      const batches = chunk(itemKeys ?? [], OLOCKER_MAX_TAGS_PER_REQUEST);
      const result = { issuedCount: 0, skipped: [], failures: [], unattributed: false, items: [] };

      for (let i = 0; i < batches.length; i += 1) {
        onProgress?.({ done: i, total: batches.length });
        try {
          const data = await generateInsurance({ transactionId, itemKeys: batches[i] });
          result.issuedCount += data?.issuedCount ?? 0;
          result.skipped.push(...(data?.skipped ?? []));
          result.failures.push(...(data?.failures ?? []));
          result.items = data?.items ?? result.items;
          if (data?.unattributed) {
            // Row count didn't match what we sent — the server has latched
            // the invoice; anything further would be refused anyway.
            result.unattributed = true;
            break;
          }
        } catch (error) {
          // Nothing issued yet: surface it as the mutation's own error.
          if (result.issuedCount === 0) throw error;

          if (error?.code === 'ALREADY_INSURED') continue;
          // A batch whose items all lack Olocker's mandatory data — report
          // the reasons and carry on with the rest.
          if (error?.status === 422 && error?.payload?.skipped) {
            result.skipped.push(...error.payload.skipped);
            continue;
          }
          result.failures.push(error?.message || TOAST.INSURANCE.FAILED);
          if (STOP_CODES.has(error?.code)) break;
        }
      }
      return result;
    },

    onSuccess: (data, { transactionId }) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.INSURANCE.BY_INVOICE(transactionId),
      });

      // Olocker accepted the calls but declined every line — a
      // success-shaped failure the operator still has to see.
      if (!data?.issuedCount) {
        toast.error(data?.failures?.[0] || TOAST.INSURANCE.NONE_ISSUED);
        tracker.track(EVENTS.INSURANCE_FAILED, {
          transactionId, reason: 'none_issued', ...sessionCtx,
        });
        return;
      }

      toast.success(TOAST.INSURANCE.GENERATED(data.issuedCount));
      // Partial outcomes: lines dropped for missing data, rows Olocker
      // turned down, or a later batch that failed after earlier ones issued.
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
        error?.code === 'ALREADY_INSURED'
          ? TOAST.INSURANCE.ALREADY_INSURED
          : (error?.message || TOAST.INSURANCE.FAILED),
      );
      // The invoice's insurance state may have changed under us (already
      // covered, or latched after a timeout) — refetch so the sheet shows it.
      if ([409, 504].includes(error?.status)) {
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
