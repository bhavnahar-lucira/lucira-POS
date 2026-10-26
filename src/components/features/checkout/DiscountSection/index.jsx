'use client';

import { Eye, Tag } from 'lucide-react';
import { useCart } from '@/hooks/cart/useCart';
import { useCheckoutPricing } from '@/hooks/checkout/useCheckoutPricing';
import { usePromoValidation } from '@/hooks/checkout/usePromoValidation';
import { getPromoBreakdown } from '@/services/checkoutPricingService';
import PromoCodeInput from '@/components/features/checkout/PromoCodeInput';
import PromoCodeSheet from '@/components/features/checkout/PromoCodeSheet';
import AppliedPromoTag from '@/components/shared/AppliedPromoTag';
import { Button } from '@/components/ui/button';

// Purely presentational + direct user actions (apply/remove a promo code).
// ALL automatic/reactive gold-coin promo management (auto-apply, its own
// eligibility re-validation, free-gift quantity auto-discovery, and the
// generic "no longer applies" cleanup) lives in useGoldCoinPromoManager
// instead, mounted exactly once from AppShell — see that hook's own header
// for why: this component is rendered independently, and simultaneously
// mountable, in three places (the header's mini-cart drawer, /cart,
// /checkout), and running those effects once per mount raced multiple
// uncoordinated state machines against the same shared cart state.
/**
 * @param {{ compact?: boolean, onViewCart?: () => void }} props
 */
export default function DiscountSection({ compact = false, onViewCart }) {
  const { appliedPromos, removePromo, isEmpty } = useCart();
  const { invoice, order, isLoading: isPricing } = useCheckoutPricing();
  const promotionDetails = [
    ...(invoice?.promotionDetails ?? []),
    ...(order?.promotionDetails ?? []),
  ];
  const { validatePromo, isValidating } = usePromoValidation({ invoice, order });
  const notReadyToCheck = !invoice?.lineItems?.length && !order?.lineItems?.length;
  const disabledHint = isEmpty
    ? 'Add items to your cart before applying a promo code.'
    : 'Still pricing your cart — promo codes can be applied once that’s done.';
  const breakdown = getPromoBreakdown(appliedPromos, promotionDetails);
  const breakdownByCode = new Map(breakdown.map((b) => [b.promoCode, b]));

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
            triggerClassName="flex-1"
          />
        )}
      </div>

      {!compact && notReadyToCheck && (
        <p className="text-xs text-muted-foreground">{disabledHint}</p>
      )}

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
