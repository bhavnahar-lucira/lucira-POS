'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCartTotals } from '@/hooks/cart/useCartTotals';

/**
 * @param {{
 *   totals?: {subTotal, taxAmount, cgstAmount, sgstAmount, netAmount, discount}|null,
 *   isPricing?: boolean,
 *   creditApplied?: number,
 *   collapsible?: boolean,
 *   discountBreakdown?: {promoCode, promoName, amount, hasEffect}[],
 * }} props
 *   totals.cgstAmount/sgstAmount — real, summed straight from each line's own
 *   item_taxes[] (see checkoutPricingService.summarizeLineItems / lib/gst.js's
 *   sumRealGst) — never reconstructed. Before real pricing resolves (totals
 *   is null, only the cart's own flat estimate is available — see
 *   useCartTotals), there is no real per-line breakdown to draw from, so no
 *   CGST/SGST split is shown at all rather than guessing one.
 *
 *   discountBreakdown — from checkoutPricingService.getPromoBreakdown, the
 *   SAME computation DiscountSection's own applied-promo tags use, so the
 *   per-code figure shown here always agrees with the one shown there.
 *   Reported directly (2026-09-30): a customer applying two codes only ever
 *   saw one combined "Discount" figure and had no way to tell which promo
 *   contributed what — each code with a real effect (hasEffect) now gets its
 *   own named line, listed BEFORE the combined total below them.
 */
export default function CartSummary({
  totals = null, isPricing = false, creditApplied = 0, collapsible = false, discountBreakdown = [],
}) {
  const cart = useCartTotals();
  const [expanded, setExpanded] = useState(!collapsible);

  const subtotal = totals ? totals.subTotal  : cart.subtotal;
  const discount = totals ? (totals.discount ?? 0) : cart.discount;
  // Only codes that actually landed a real amount here — a declined/no-
  // effect code is surfaced by AppliedPromoTag instead, not silently listed
  // here at ₹0.
  const namedDiscounts = discountBreakdown.filter((b) => b.hasEffect && b.amount > 0);
  const rawTotal   = totals ? totals.netAmount : cart.total;
  const roundedTotal = Math.round(rawTotal);
  const roundOff   = +(roundedTotal - rawTotal).toFixed(2);
  const total      = Math.max(0, roundedTotal - creditApplied);
  // Real only — null (no breakdown rendered) until the actual per-line
  // pricing has resolved.
  const gst = totals ? { cgst: totals.cgstAmount ?? 0, sgst: totals.sgstAmount ?? 0 } : null;
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
            <div className="flex flex-col gap-1">
              {/* "Discount" title row FIRST, its per-promo bifurcation
                  listed beneath it — reported directly (2026-09-30). */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Discount</span>
                <span className="font-medium text-status-in-stock">
                  −₹{discount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
              {namedDiscounts.map((b) => (
                <div key={b.promoCode} className="flex items-center justify-between gap-2 pl-2 text-xs text-muted-foreground border-l-2 border-status-in-stock/30">
                  <span className="truncate">{b.promoName}</span>
                  <span className="shrink-0 font-medium text-status-in-stock">
                    −₹{b.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
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
          
          {totals && discount > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Taxable Value</span>
              <span className="font-medium text-foreground">
                ₹{totals.taxableAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

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
