'use client';

// Subtotal / discount / total breakdown. Pure/presentational, driven by
// useCartTotals() unless server-priced `totals` is supplied — reused as-is
// across the Cart Drawer, Checkout, and order review; keep it free of
// drawer-specific logic (e.g. close handlers).

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCartTotals } from '@/hooks/cart/useCartTotals';
import { splitGst } from '@/lib/gst';

/**
 * @param {{
 *   totals?: {subTotal, taxAmount, netAmount, discount}|null,
 *   isPricing?: boolean,
 *   creditApplied?: number,
 *   collapsible?: boolean,
 * }} props
 *   totals - server-priced figures for the actual stock pieces (after the
 *   promotion calculator runs), which win over the cart's own estimate
 *   since they're what the customer is actually charged. netAmount is
 *   already net of discount and re-taxed.
 *
 *   creditApplied - Nector Loyalty applied as a payment mode at checkout
 *   (see CheckoutPaymentSection/checkout page.jsx) — a PAYMENT toward the
 *   total, not a price reduction, so unlike a promo it's never folded into
 *   `totals`; subtracted client-side on top of the total instead. Shown as
 *   its own "Credit Applied" row, independent of Discount — the two are no
 *   longer mutually exclusive now that loyalty is a payment mode rather
 *   than a cart-level redemption, so both can be non-zero at once. Only
 *   ever non-zero on the checkout page itself (mini cart / cart page have
 *   no payment mode selection, so they never pass this).
 *
 *   collapsible (default false) — the mini cart drawer's own footer is a
 *   fixed, non-scrolling area (see BottomSheet); the full breakdown sitting
 *   there permanently left little room for the actual cart items list on a
 *   short phone screen (reported directly). When true, only the Total row
 *   renders by default — tapping it reveals Subtotal/Discount/Tax/etc.
 *   above it, and tapping again collapses back down. Checkout and the full
 *   cart page have a whole page to scroll, so they don't opt into this.
 */
export default function CartSummary({ totals = null, isPricing = false, creditApplied = 0, collapsible = false }) {
  const cart = useCartTotals();
  const [expanded, setExpanded] = useState(!collapsible);

  const subtotal = totals ? totals.subTotal  : cart.subtotal;
  const tax      = totals ? totals.taxAmount : cart.tax;
  const discount = totals ? (totals.discount ?? 0) : cart.discount;

  // Total is rounded to a whole rupee (so the amount collected settles the
  // invoice exactly); roundOff is shown as its own line so the displayed
  // figures reconcile exactly with the rounded Total.
  const rawTotal   = totals ? totals.netAmount : cart.total;
  const roundedTotal = Math.round(rawTotal);
  const roundOff   = +(roundedTotal - rawTotal).toFixed(2);
  const total      = Math.max(0, roundedTotal - creditApplied);
  // Bifurcated into CGST/SGST for display — see lib/gst.js. The combined
  // `tax` above is still what's summed into the header at submission time.
  const gst = splitGst(tax);
  const showBreakdown = !collapsible || expanded;

  const totalRow = (
    <>
      <span className="flex items-center gap-1 text-base font-bold text-foreground">
        Total
        {collapsible && (
          expanded
            ? <ChevronUp size={16} className="text-muted-foreground" aria-hidden="true" />
            : <ChevronDown size={16} className="text-muted-foreground" aria-hidden="true" />
        )}
      </span>
      <span className="font-heading text-xl font-semibold text-primary tabular-nums">
        ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </span>
    </>
  );

  return (
    <div className="flex flex-col gap-2 py-2" aria-busy={isPricing || undefined}>
      {showBreakdown && (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span className="font-medium text-foreground">
              ₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>

          {discount > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Discount</span>
              <span className="font-medium text-status-in-stock">
                −₹{discount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {creditApplied > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Credit Applied</span>
              <span className="font-medium text-status-in-stock">
                −₹{creditApplied.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Taxable value — shown only for server-priced totals with a real
              promo applied (Credit Applied is a payment-side deduction and
              never touches it). */}
          {totals && discount > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Taxable Value</span>
              <span className="font-medium text-foreground">
                ₹{totals.taxableAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Shown as CGST + SGST rather than one "GST" line — see lib/gst.js. */}
          {gst && (
            <>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>CGST (1.5%)</span>
                <span className="font-medium text-foreground">
                  ₹{gst.cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>SGST (1.5%)</span>
                <span className="font-medium text-foreground">
                  ₹{gst.sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            </>
          )}

          {roundOff !== 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Round Off</span>
              <span className="font-medium text-foreground">
                {roundOff > 0 ? '+' : '−'}₹{Math.abs(roundOff).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <div className="h-px w-full bg-grad-hairline mt-1" aria-hidden="true" />
        </>
      )}

      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between pt-1 text-left"
        >
          {totalRow}
        </button>
      ) : (
        <div className="flex items-center justify-between pt-1">
          {totalRow}
        </div>
      )}
    </div>
  );
}
