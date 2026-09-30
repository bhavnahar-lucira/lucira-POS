'use client';

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { Eye } from 'lucide-react';
import { useCart } from '@/hooks/cart/useCart';
import { useCheckoutPricing } from '@/hooks/checkout/useCheckoutPricing';
import { usePromoValidation } from '@/hooks/checkout/usePromoValidation';
import { getPromoBreakdown } from '@/services/checkoutPricingService';
import { removePromo as removePromoAction } from '@/store/slices/cartSlice';
import PromoCodeInput from '@/components/features/checkout/PromoCodeInput';
import PromoCodeSheet from '@/components/features/checkout/PromoCodeSheet';
import AppliedPromoTag from '@/components/shared/AppliedPromoTag';
import { Button } from '@/components/ui/button';
import TOAST from '@/constants/toastMessages';

/**
 * @param {{ compact?: boolean, onViewCart?: () => void }} props
 *   compact: true hides the manual promo-code input (mini cart drawer only —
 *   see this file's header).
 *   onViewCart: only passed by the mini cart drawer — renders a "View
 *   Details" button next to "View available offers" that navigates to the
 *   full cart page. Omitted everywhere else (already on/past the cart).
 */
export default function DiscountSection({ compact = false, onViewCart }) {
  const dispatch = useDispatch();
  const { appliedPromos, removePromo, isEmpty } = useCart();
  const { invoice, order, isLoading: isPricing } = useCheckoutPricing();
  // A code can be applied to the invoice group, the order group, or both —
  // combine both groups' promotion_details rows so "is this code already
  // showing an effect" reads correctly regardless of which one it landed on.
  const promotionDetails = [
    ...(invoice?.promotionDetails ?? []),
    ...(order?.promotionDetails ?? []),
  ];
  const { validatePromo, isValidating } = usePromoValidation({ invoice, order });
  const notReadyToCheck = !invoice?.lineItems?.length && !order?.lineItems?.length;
  const disabledHint = isEmpty
    ? 'Add items to your cart before applying a promo code.'
    : 'Still pricing your cart — promo codes can be applied once that’s done.';

  // Single source of truth for "how much did this code actually save" —
  // see getPromoBreakdown's own header for why this must sum every matching
  // row across both groups, not just find the first.
  const breakdown = getPromoBreakdown(appliedPromos, promotionDetails);
  const breakdownByCode = new Map(breakdown.map((b) => [b.promoCode, b]));

  useEffect(() => {
    if (isPricing) return;
    breakdown.forEach((b) => {
      if (!b.hasEffect) {
        dispatch(removePromoAction(b.promoCode));
        toast.error(TOAST.CART.PROMO_NO_LONGER_APPLIES(b.promoName));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPricing, promotionDetails]);

  return (
    <div className="flex flex-col gap-3">
      {/* Both discount actions sit side by side, one row, on every surface —
          reported directly (2026-09-30): stacked full-width buttons read as
          a longer list than this really is. Mini cart drawer (compact) pairs
          "View available offers" with "View Details" (→ /cart); cart/checkout
          pair it with "Enter Promo" instead. */}
      <div className="flex gap-2">
        <PromoCodeSheet
          onApply={validatePromo}
          isApplying={isValidating}
          appliedPromos={appliedPromos}
          triggerClassName="flex-1"
        />
        {compact ? (
          onViewCart && (
            <Button
              type="button"
              variant="outline"
              onClick={onViewCart}
              className="h-auto min-h-9 flex-1 justify-center gap-2 whitespace-normal py-2 text-center text-xs font-semibold leading-tight bg-secondary sm:text-sm"
            >
              <Eye className="size-4 shrink-0" aria-hidden="true" />
              View Details
            </Button>
          )
        ) : (
          <PromoCodeInput
            onApply={(code, overrideAmount) => validatePromo({ promoCode: code, overrideAmount })}
            isValidating={isValidating}
            disabled={notReadyToCheck}
            disabledHint={disabledHint}
            triggerClassName="flex-1"
          />
        )}
      </div>

      {appliedPromos.map((promo) => {
        const b = breakdownByCode.get(promo.promoCode);
        const declined = !isPricing && !b?.hasEffect;
        return (
          <div key={promo.promoCode} className="flex flex-col gap-1">
            <AppliedPromoTag
              promoCode={promo.promoCode}
              promoName={promo.promoDetails?.promotion_name}
              discountAmount={b?.amount ?? 0}
              hasEffect={!declined}
              onRemove={() => removePromo(promo.promoCode)}
            />
          </div>
        );
      })}
    </div>
  );
}
