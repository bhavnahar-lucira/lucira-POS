'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartTotals } from '@/hooks/cart/useCartTotals';
import { formatAmount as money } from '@/lib/priceUtils';

/**
 * @param {{
 *   isValid: boolean,
 *   isPlacingOrder: boolean,
 *   onPlaceOrder: () => void,
 *   amountDue?: number,     — live-priced total (see useCheckoutPricing)
 *   amountCollected?: number, — what the payment rows currently add up to
 *   creditApplied?: number, — Nector Loyalty amount already redeemed toward
 *     this sale (a payment mode, not a discount — see checkout/page.jsx's
 *     own comment on why at most one document can ever carry it).
 *   isPricing?: boolean,
 *   documentType?: 'invoice'|'order',
 * }} props
 */
export default function PlaceOrderButton({
  isValid, isPlacingOrder, onPlaceOrder, amountDue, amountCollected,
  creditApplied = 0, isPricing, documentType = 'invoice',
}) {
  const { total: cartTotal } = useCartTotals();
  const total = amountDue ?? cartTotal;
  const isOrder = documentType === 'order';
  const chargeable = Math.max(0, (isOrder ? (amountCollected ?? 0) : total) - creditApplied);

  return (
    <Button
      type="button"
      variant="premium"
      onClick={onPlaceOrder}
      disabled={!isValid || isPlacingOrder || isPricing}
      className="h-12 w-full text-base font-semibold"
    >
      {isPlacingOrder ? (
        <>
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          {isOrder ? 'Placing order…' : 'Generating invoice…'}
        </>
      ) : isPricing ? (
        <>
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          Pricing items…
        </>
      ) : isOrder ? (
        chargeable > 0
          ? `Place Order · Advance ${money(chargeable)}`
          : 'Place Order · No advance'
      ) : (
        `Complete Sale · ${money(chargeable)}`
      )}
    </Button>
  );
}