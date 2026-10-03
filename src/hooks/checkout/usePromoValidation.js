// src/hooks/checkout/usePromoValidation.js
// Promo code validation for checkout. GetPromotion does not filter by code
// server-side, so a typed code is validated by fetching every promotion and
// matching promotion_code client-side (same as useActivePromotions).
//
// Multiple promos can be applied at once — REMOVED 2026-09-30 a client-side
// "only one %-off and one flat-off at a time" gate that was never a real
// OrnaVerse rule: reported directly (live in OrnaVerse's own POS, 4 real
// promotions — including two separate %-off ones — all applied together on
// one bill), so blocking a second %-off promo here was actively wrong, not
// conservative. What actually governs whether two promotions combine is each
// PromotionRow's own `exclude_policy` flag (confirmed live in OrnaVerse's own
// CRM > Promotion admin — a real self-exclusivity checkbox, unchecked on
// every promotion tested), enforced entirely server-side by
// Helper/ApplyPromotions, same principle as the discount amount itself (see
// promotionService.applyPromotions). Not re-modeled here: if a promo turns
// out not to combine with what's already applied, it simply comes back with
// no effect once the real fold runs (useCheckoutPricing), and
// DiscountSection's own "no longer applies" effect already removes it.
//
// Eligibility is checked before applying: the candidate code is run through
// the same server call checkout pricing uses (Helper/ApplyPromotions) against
// the already-priced basket, and only reaches cart/applyPromo if that comes
// back with a real discount row — avoids adding an ineligible promo and then
// having to walk it back once pricing catches up.
//
// REMOVED 2026-09-25 — a promo code and Nector Loyalty used to be mutually
// exclusive (Loyalty was a cart-level redemption, cartSlice's old
// redeemedCoins). Loyalty is now a checkout PAYMENT MODE (see
// CheckoutPaymentSection), independent of the promo/discount mechanism
// entirely — both can be applied to the same sale.

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
 *   useCheckoutPricing's own two-group output. A code is checked against
 *   BOTH present groups (each against its own real document_id) and counts
 *   as eligible if it has an effect on either — a promo can legitimately
 *   apply to only the invoice-shaped lines or only the order-shaped ones in
 *   a mixed cart, same as it already can apply to only some lines within one
 *   group (see applyPromotionsToLines' own header). null/empty while
 *   checkout is still pricing — Apply is a no-op (PROMO_NOT_READY) until at
 *   least one group is ready.
 */
export function usePromoValidation({ invoice, order }) {
  const { applyPromo } = useCart();
  const sessionCtx = useSessionTrackingContext();

  const mutation = useMutation({
    // Accepts either a bare code string (PromoCodeSheet's "Apply Selected",
    // which never sets an override) or { promoCode, overrideAmount } (
    // PromoCodeInput's "Enter Promo", mirroring OrnaVerse's own dialog).
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

      // No local minimum-order gate — `minimum_sales_amount` is measured
      // against a component chosen by `minimum_sales_amount_calc_on`, so
      // eligibility is entirely the server call below.
      if (!invoice?.lineItems?.length && !order?.lineItems?.length) {
        return { status: 'not_ready', promotion };
      }

      // Checked in isolation against the base priced lines, not folded on
      // top of whatever else is already applied — catches the common case
      // (a promo that just doesn't apply to what's in the basket) without
      // modeling every multi-promo stacking interaction. Tried against
      // whichever group(s) actually have lines; either coming back with a
      // real discount row makes the code eligible overall. The override
      // amount (if any) is passed through here too, so a promo that only
      // becomes eligible/ineligible once overridden is checked correctly —
      // same real override_amount field either way.
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
          // `promoDetails` is the full PromotionRow, which is what
          // Helper/ApplyPromotions needs as input; the rupee value comes
          // back from checkout's own pricing pass (cartSlice.recalculateTotals).
          //
          // Not tracked here directly — dispatching cart/applyPromo below is
          // already caught by analyticsMiddleware.js's 'cart/applyPromo' case,
          // which fires EVENTS.PROMO_APPLIED once per dispatch. A second
          // tracker.track() call here would double-fire the event.
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
