'use client';

// Submits the sale via useCreateInvoice or useCreateOrder; disabled until
// checkoutSchema validation passes. Reports what's about to happen rather
// than offering a choice — for an order, the label shows the advance being
// collected right now, not the order's full value.

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
 *   creditApplied — subtracted from the displayed figure in every branch so
 *   this button always shows the same number `CartSummary`'s own "Total"
 *   line shows (that component already subtracts it) — reported directly,
 *   2026-09-30: "the button displays the product price not the updated
 *   cart summary price after applying nector points."
 */
export default function PlaceOrderButton({
  isValid, isPlacingOrder, onPlaceOrder, amountDue, amountCollected,
  creditApplied = 0, isPricing, documentType = 'invoice',
}) {
  const { total: cartTotal } = useCartTotals();
  const total = amountDue ?? cartTotal;
  const isOrder = documentType === 'order';

  // An order can be part-paid, so show the advance actually entered; an
  // invoice always settles in full, so the two are the same number.
  // Math.max(0, ...) mirrors CartSummary's own clamp against the same figure.
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
        // No advance is a legitimate order, so don't label it "Advance ₹0".
        chargeable > 0
          ? `Place Order · Advance ${money(chargeable)}`
          : 'Place Order · No advance'
      ) : (
        `Complete Sale · ${money(chargeable)}`
      )}
    </Button>
  );
}