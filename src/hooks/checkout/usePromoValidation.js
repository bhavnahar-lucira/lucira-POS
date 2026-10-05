import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { listPromotions } from '@/services/promotionService';
import { applyPromotionsToLines } from '@/services/checkoutPricingService';
import { useCart } from '@/hooks/cart/useCart';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import { isPromotionActive } from '@/lib/normalizers/promotion';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import TOAST from '@/constants/toastMessages';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {{ invoice: {lineItems}|null, order: {lineItems}|null }} split —
 */
export function usePromoValidation({ invoice, order }) {
  const { applyPromo } = useCart();
  const sessionCtx = useSessionTrackingContext();

  const mutation = useMutation({
    mutationFn: async (input) => {
      const promoCode = typeof input === 'string' ? input : input.promoCode;
      const overrideAmount = typeof input === 'string' ? null : (input.overrideAmount ?? null);

      const response = await listPromotions();
      const entities = response?.data?.Entities ?? [];
      const active   = entities.filter(isPromotionActive);
      const promotion = active.find(
        (p) => p.promotion_code?.toUpperCase() === promoCode.toUpperCase()
      ) ?? null;

      if (!promotion) return { status: 'invalid' };
      if (!invoice?.lineItems?.length && !order?.lineItems?.length) {
        return { status: 'not_ready', promotion };
      }
      const candidate = { promoCode: promotion.promotion_code, promoDetails: promotion, overrideAmount };
      const [invoiceResult, orderResult] = await Promise.all([
        invoice?.lineItems?.length
          ? applyPromotionsToLines({ lineItems: invoice.lineItems, appliedPromos: [candidate], documentId: APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE })
          : null,
        order?.lineItems?.length
          ? applyPromotionsToLines({ lineItems: order.lineItems, appliedPromos: [candidate], documentId: APP_CONFIG.DOCUMENT_TYPES.POS_ORDER })
          : null,
      ]);
      const hasEffect = (invoiceResult?.promotionDetails?.length ?? 0) > 0
        || (orderResult?.promotionDetails?.length ?? 0) > 0;

      if (!hasEffect) return { status: 'ineligible', promotion };
      return { status: 'eligible', promotion, overrideAmount };
    },

    // Every outcome tracks an analytics event, with a `reason` distinguishing
    // which one so PROMO_FAILED isn't an undifferentiated bucket.
    onSuccess: (result, variables) => {
      const promoCode = typeof variables === 'string' ? variables : variables.promoCode;
      switch (result.status) {
        case 'invalid':
          toast.error(TOAST.CART.PROMO_INVALID(promoCode));
          tracker.track(EVENTS.PROMO_FAILED, { reason: 'invalid', promoCode, ...sessionCtx });
          return;

        case 'not_ready':
          toast.error(TOAST.CART.PROMO_NOT_READY);
          tracker.track(EVENTS.PROMO_FAILED, {
            reason: 'not_ready', promoCode, promotionCode: result.promotion?.promotion_code, ...sessionCtx,
          });
          return;

        case 'ineligible':
          toast.error(TOAST.CART.PROMO_NOT_APPLICABLE(result.promotion.promotion_name ?? result.promotion.promotion_code));
          tracker.track(EVENTS.PROMO_FAILED, {
            reason: 'ineligible', promoCode: result.promotion.promotion_code, ...sessionCtx,
          });
          return;

        case 'eligible':
          applyPromo({
            promoCode:      result.promotion.promotion_code,
            promoDetails:   result.promotion,
            overrideAmount: result.overrideAmount ?? null,
          });
          return;

        default:
          return;
      }
    },

    onError: (error, variables) => {
      const promoCode = typeof variables === 'string' ? variables : variables.promoCode;
      toast.error(TOAST.CART.PROMO_FAILED);
      tracker.track(EVENTS.PROMO_FAILED, {
        reason: 'error', promoCode, error: error?.message ?? 'unknown', ...sessionCtx,
      });
    },
  });

  return {
    validatePromo: mutation.mutate,
    isValidating:  mutation.isPending,
  };
}
