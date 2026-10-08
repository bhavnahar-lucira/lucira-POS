'use client';

import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'sonner';
import { Eye, Tag } from 'lucide-react';
import { useCart } from '@/hooks/cart/useCart';
import { useCheckoutPricing } from '@/hooks/checkout/useCheckoutPricing';
import { usePromoValidation } from '@/hooks/checkout/usePromoValidation';
import { useActivePromotions } from '@/hooks/checkout/useActivePromotions';
import { getPromoBreakdown } from '@/services/checkoutPricingService';
import { removePromo as removePromoAction } from '@/store/slices/cartSlice';
import PromoCodeInput from '@/components/features/checkout/PromoCodeInput';
import PromoCodeSheet from '@/components/features/checkout/PromoCodeSheet';
import AppliedPromoTag from '@/components/shared/AppliedPromoTag';
import { Button } from '@/components/ui/button';
import TOAST from '@/constants/toastMessages';

// This tenant's real stock item for "0.100 gms 22 kt Gold Coin" (SKU
// LJ-GC0002-916YGPG, confirmed live 2026-10-07) — identifies the gold coin
// promotion by the physical gift item it hands out (promotion_type 6 +
// free_item_id), not by its promotion_code/name. OrnaVerse has already
// rotated through 5+ differently-coded iterations of this same recurring
// offer (P2UA0EGQ, P4EWOWGX, BH9B, ...) — matching on the stable item
// instead of a code means this keeps finding "the gold coin promotion"
// automatically through every future rotation, with nothing to update here.
const GOLD_COIN_FREE_ITEM_ID = 98830;

/**
 * @param {{ compact?: boolean, onViewCart?: () => void }} props
 */
export default function DiscountSection({ compact = false, onViewCart }) {
  const dispatch = useDispatch();
  const { appliedPromos, removePromo, isEmpty } = useCart();
  const { invoice, order, isLoading: isPricing } = useCheckoutPricing();
  const promotionDetails = [
    ...(invoice?.promotionDetails ?? []),
    ...(order?.promotionDetails ?? []),
  ];
  const { validatePromo, isValidating } = usePromoValidation({ invoice, order });
  const { data: activePromotions = [] } = useActivePromotions();
  const notReadyToCheck = !invoice?.lineItems?.length && !order?.lineItems?.length;
  const disabledHint = isEmpty
    ? 'Add items to your cart before applying a promo code.'
    : 'Still pricing your cart — promo codes can be applied once that’s done.';
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

  // Enforces the gold coin promotion's Invoice-only rule even when OrnaVerse
  // itself would still accept it. Reported directly (2026-10-07): dropping a
  // line's quantity below what's actually in stock flips the WHOLE cart to
  // one Order (buildPricedLineItems is all-or-nothing, see its own header) —
  // the auto-added gold coin line moves into that Order along with
  // everything else, and OrnaVerse's ApplyPromotions still happily zeroes it
  // there, since nothing about its own eligibility rules cares which
  // document type it lands on. The generic "no longer applies" cleanup above
  // doesn't catch this either, because it never stops having an effect — it
  // just starts having the WRONG one. This is a business rule specific to
  // this one promotion (physical stock isn't in hand yet for an MTO
  // booking), not something OrnaVerse's own data expresses, so it's enforced
  // here rather than left to the generic eligibility cleanup.
  useEffect(() => {
    if (isPricing) return;
    const goldCoinApplied = appliedPromos.find(
      (p) => p.promoDetails?.promotion_type === 6 && p.promoDetails?.free_item_id === GOLD_COIN_FREE_ITEM_ID
    );
    if (!goldCoinApplied || invoice?.lineItems?.length) return;

    dispatch(removePromoAction(goldCoinApplied.promoCode));
    toast.error(TOAST.CART.PROMO_INVOICE_ONLY_REMOVED(goldCoinApplied.promoDetails?.promotion_name ?? goldCoinApplied.promoCode));
  }, [isPricing, invoice, appliedPromos, dispatch]);

  // Auto-apply the gold coin promotion — Invoice (real stock) only, never
  // for an Order (Made to Order): confirmed live stock isn't in hand yet for
  // an MTO booking, so handing out the physical coin doesn't make sense
  // there. Real eligibility (item category, ₹ threshold) is still decided
  // only by OrnaVerse's own ApplyPromotions call inside validatePromo — this
  // just finds the promotion and triggers the same flow a manual pick would,
  // skipping it entirely for a cart that obviously can't qualify (no line in
  // any of the promotion's own eligible categories) so it doesn't flicker
  // the free coin in and back out on every unrelated invoice.
  const autoAppliedCartKeyRef = useRef(null);
  useEffect(() => {
    if (isPricing) return;
    // Leaving Invoice mode entirely (cart fell back to Order, or emptied)
    // clears the memory of what was already tried — reported directly
    // (2026-10-07): without this, going Invoice → Order → back to the exact
    // same stock pieces never re-applied, since the ref still remembered
    // that cart composition as "already attempted" from before it left.
    if (!invoice?.lineItems?.length) {
      autoAppliedCartKeyRef.current = null;
      return;
    }

    const goldCoinPromo = activePromotions.find(
      (p) => p.promotion_type === 6 && p.free_item_id === GOLD_COIN_FREE_ITEM_ID
    );
    if (!goldCoinPromo) return;
    if (appliedPromos.some((p) => p.promoCode === goldCoinPromo.promotion_code)) return;

    const eligibleGroupIds = (goldCoinPromo.promotion_details ?? []).map((d) => d.item_group_id);
    if (eligibleGroupIds.length > 0) {
      const hasEligibleLine = invoice.lineItems.some((li) => eligibleGroupIds.includes(li.item_group_id));
      if (!hasEligibleLine) return;
    }

    const cartKey = invoice.lineItems.map((li) => `${li.item_id}-${li.sku}`).join('|');
    if (autoAppliedCartKeyRef.current === cartKey) return;
    autoAppliedCartKeyRef.current = cartKey;

    validatePromo(goldCoinPromo.promotion_code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPricing, invoice, activePromotions, appliedPromos]);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
        <Tag size={16} className="text-accent shrink-0" aria-hidden="true" />
        Discounts &amp; Offers
      </h2>
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
            onApply={(code, overrideAmount) => validatePromo({ promoCode: code, overrideAmount, manualEntry: true })}
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
    </section>
  );
}
