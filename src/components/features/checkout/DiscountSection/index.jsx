'use client';

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { useCart } from '@/hooks/cart/useCart';
import { useCheckoutPricing } from '@/hooks/checkout/useCheckoutPricing';
import { usePromoValidation } from '@/hooks/checkout/usePromoValidation';
import { removePromo as removePromoAction } from '@/store/slices/cartSlice';
import PromoCodeInput from '@/components/features/checkout/PromoCodeInput';
import PromoCodeSheet from '@/components/features/checkout/PromoCodeSheet';
import AppliedPromoTag from '@/components/shared/AppliedPromoTag';
import TOAST from '@/constants/toastMessages';

/**
 * @param {{ compact?: boolean }} props — compact: true hides the manual
 *   promo-code input (mini cart drawer only — see this file's header).
 */
export default function DiscountSection({ compact = false }) {
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

  // A promo can produce a SEPARATE promotion_details row in each group when
  // it applies to both (a genuinely mixed invoice/order cart) — confirmed
  // live 2026-09-30: "20% Off Diamond" on a real 2-item mixed cart produced
  // one row worth ₹2,064 on the invoice side and a second worth ₹206.40 on
  // the order side. Summing every matching row (not just the first) is what
  // makes the tag's "You saved ₹X" match the real combined total shown in
  // each Order Summary section — .find() here silently dropped whichever
  // group's row wasn't first in the array.
  const amountFor = (promoCode) => {
    const rows = promotionDetails.filter((row) => row.promotion_code === promoCode);
    if (!rows.length) return null;
    return rows.reduce((sum, row) => sum + (Number(row.promotion_amount) || 0), 0);
  };
  useEffect(() => {
    if (isPricing) return;
    appliedPromos.forEach((promo) => {
      if (amountFor(promo.promoCode) == null) {
        dispatch(removePromoAction(promo.promoCode));
        toast.error(TOAST.CART.PROMO_NO_LONGER_APPLIES(promo.promoCode));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPricing, promotionDetails]);

  return (
    <div className="flex flex-col gap-3">
      <PromoCodeSheet
        onApply={validatePromo}
        isApplying={isValidating}
        appliedPromos={appliedPromos}
      />
      {appliedPromos.map((promo) => {
        const amount = amountFor(promo.promoCode);
        const declined = !isPricing && amount == null;
        return (
          <div key={promo.promoCode} className="flex flex-col gap-1">
            <AppliedPromoTag
              promoCode={promo.promoCode}
              promoName={promo.promoDetails?.promotion_name}
              discountAmount={amount ?? 0}
              hasEffect={!declined}
              onRemove={() => removePromo(promo.promoCode)}
            />
          </div>
        );
      })}

      {!compact && (
        <PromoCodeInput
          onApply={(code, overrideAmount) => validatePromo({ promoCode: code, overrideAmount })}
          isValidating={isValidating}
          disabled={notReadyToCheck}
          disabledHint={disabledHint}
        />
      )}
    </div>
  );
}
