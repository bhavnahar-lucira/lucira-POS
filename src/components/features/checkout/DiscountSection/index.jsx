'use client';

// Promo code entry + applied discount display, shared by the mini cart
// drawer, full cart page, and checkout (not the product detail page — a
// promo there would have nothing priced yet to apply against). Pricing is
// fetched here via useCheckoutPricing, which reads the cart/store directly,
// so every screen rendering this shares one cached, server-priced query.
//
// Multiple promos can be applied at once, each with its own remove
// action. "Similar" (same discount-type) conflicts are blocked in
// usePromoValidation, not here.
//
// compact (mini cart drawer only, 2026-09-28, reported directly): the
// manual "ENTER PROMO CODE" box is the ONLY way to reach a code_required
// promotion (see useActivePromotions.js — those are deliberately excluded
// from the "View available offers" ticket list). Surfacing that manual box
// in the small drawer let an operator apply a code_required offer from
// there too, which isn't where that flow is meant to live — direct
// (non-picker) code entry belongs on the full checkout page. compact hides
// PromoCodeInput and keeps only the offers-list button, so a code_required
// promotion is reachable ONLY from checkout, never from the mini cart.

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
  const {
    lineItems: pricedLineItems,
    documentId,
    promotionDetails,
    isLoading: isPricing,
  } = useCheckoutPricing();
  const { validatePromo, isValidating } = usePromoValidation(pricedLineItems, documentId);
  // Disabled rather than left to fail after the click — mirrors
  // usePromoValidation's own PROMO_NOT_READY fallback. Empty cart and
  // still-pricing are surfaced as distinct hints below.
  const notReadyToCheck = !pricedLineItems?.length;
  const disabledHint = isEmpty
    ? 'Add items to your cart before applying a promo code.'
    : 'Still pricing your cart — promo codes can be applied once that’s done.';

  const amountFor = (promoCode) =>
    promotionDetails.find((row) => row.promotion_code === promoCode)?.promotion_amount ?? null;

  // Defensive backstop: a promo valid at apply-time can stop applying if
  // the cart changes afterward, since nothing else revalidates an
  // already-applied promo. Auto-removes it once pricing has settled
  // (!isPricing avoids yanking it mid-fetch). Dispatches the raw action
  // rather than useCart's removePromo to avoid a duplicate generic toast.
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
      {/* Standalone trigger, not nested in a bordered "Discount" card
          (reported directly — that box design is retired) — reads as its
          own independent action, first thing in this section either way. */}
      <PromoCodeSheet
        onApply={validatePromo}
        isApplying={isValidating}
        appliedPromos={appliedPromos}
      />

      {/* Muted styling (hasEffect=false) covers the one render between
          pricing settling and the effect above removing a no-longer-valid
          promo, so that instant never looks like a win. */}
      {appliedPromos.map((promo) => {
        const amount = amountFor(promo.promoCode);
        const declined = !isPricing && amount == null;
        return (
          <div key={promo.promoCode} className="flex flex-col gap-1">
            <AppliedPromoTag
              promoCode={promo.promoCode}
              discountAmount={amount ?? 0}
              hasEffect={!declined}
              onRemove={() => removePromo(promo.promoCode)}
            />
          </div>
        );
      })}

      {!compact && (
        <PromoCodeInput
          onApply={validatePromo}
          isValidating={isValidating}
          disabled={notReadyToCheck}
          disabledHint={disabledHint}
        />
      )}
    </div>
  );
}
