import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addMetalRate } from '@/services/settingsService';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

function getErrorMessage(error, fallback = TOAST.METAL_RATES.ADD_FAILED) {
  return (
    error?.response?.data?.Message ??
    error?.response?.data?.message ??
    error?.message ??
    fallback
  );
}

/**
 * Mutation hook for creating a metal rate entry.
 * Maps to: POST Services/Costing/MetalRates/Create
 */
export function useAddMetalRate({ onSuccess } = {}) {
  const queryClient = useQueryClient();
  const sessionCtx = useSessionTrackingContext();

  return useMutation({
    mutationFn: (payload) => addMetalRate(payload),
    onSuccess: (data, variables) => {
      // A new rate invalidates every cached live price. Catalog prices are
      // keyed off a pricing epoch rather than invalidated directly, so we
      // invalidate the epoch canary instead — it re-prices itself, and every
      // catalog price reprices as a consequence. This only speeds up the
      // in-app path (saves waiting out the epoch's recheck interval); rates
      // set directly in OrnaVerse's ERP are still caught by the epoch itself.
      //   ['catalog','price-epoch'] — canary fingerprint (usePricingEpoch)
      //   ['items','pricing']       — product detail / variant (useVariantPricing)
      queryClient.invalidateQueries({ queryKey: ['catalog', 'price-epoch'] });
      queryClient.invalidateQueries({ queryKey: ['items', 'pricing'] });

      toast.success(TOAST.METAL_RATES.ADDED);
      tracker.track(EVENTS.METAL_RATE_ADDED, {
        metalTypeId:  variables?.metal_type_id,
        purchaseRate: variables?.purchase_rate,
        salesRate:    variables?.sales_rate,
        ...sessionCtx,
      });
      onSuccess?.();
    },
    onError: (error, variables) => {
      const message = getErrorMessage(error);
      toast.error(message);
      tracker.track(EVENTS.METAL_RATE_ADD_FAILED, {
        error: message, metalTypeId: variables?.metal_type_id, ...sessionCtx,
      });
    },
  });
}
