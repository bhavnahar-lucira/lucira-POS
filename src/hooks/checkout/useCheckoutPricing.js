// src/hooks/checkout/useCheckoutPricing.js
// Prices the ACTUAL STOCK PIECES in the cart, once, at checkout — the
// catalog's displayed price is not the sale price (it comes from a possibly
// stale item-master rate, only re-priced live when zero AND the item has a
// BOM), so checkout re-prices before showing the payment section and every
// downstream figure (displayed amount, collected amount, submitted line
// items) is derived from this one result. Pricing once also avoids a second
// slow SetSalesItems round trip at submit.
//
// Promotions are priced here too, by the server: a promotion's percentage
// applies to a component of the item (diamond/making-charges/whole-value,
// selected by `discount_calc_on`), not the subtotal, and the server re-taxes
// after discounting. So Helper/ApplyPromotions runs inside this same query
// and its output lines ARE the line items — everything downstream (summary,
// Place Order, Create payload) is a sum of what those lines carry; nothing
// is recomputed locally.
//
// SPLIT (2026-09-29) — buildPricedLineItems now partitions the cart PER LINE
// (some lines in stock, some not) rather than deciding one document type for
// the whole basket — see that function's own header for why (OrnaVerse's
// server structurally refuses to price a non-stock line against an Invoice,
// confirmed live). This hook mirrors that with two independent group
// results instead of one flat one; either can be null, and both being
// non-null is the genuinely mixed case checkout/page.jsx renders as two
// separate sections.

import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import {
  buildPricedLineItems,
  applyPromotionsToLines,
  summarizeLineItems,
} from '@/services/checkoutPricingService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { useCart } from '@/hooks/cart/useCart';
import APP_CONFIG from '@/constants/appConfig';

function summarizeGroup(lineItems) {
  const totals = summarizeLineItems(lineItems);
  return {
    lineItems,
    totals,
    // Rounded the same way the Create payload rounds net_amount, so the
    // collected amount can settle the document to exactly zero.
    amountDue: Math.round(totals.netAmount),
  };
}

/**
 * Prices the basket once, per line group. See buildPricedLineItems for how a
 * cart line ends up in the invoice group vs the order group.
 *
 * @returns {{
 *   invoice: { lineItems, totals, promotionDetails, amountDue } | null,
 *   order:   { lineItems, totals, promotionDetails, amountDue } | null,
 *   promoCodes: string[],
 *   isLoading: boolean,
 *   error:     Error|null,
 * }}
 */
export function useCheckoutPricing() {
  const { items, appliedPromos } = useCart();
  const activeStoreId = useSelector(selectActiveStoreId);

  // Keyed on the exact cart contents AND the promotions applied, so changing
  // either re-prices, but simply revisiting checkout does not pay for the
  // calls again.
  const cartKey  = items.map((i) => `${i.itemId}x${i.quantity}`).join('|');
  // overrideAmount is included so changing ONLY it (same code) still
  // invalidates the cached pricing — the server treats it as part of the
  // promotion request, not something to re-derive locally.
  const promoKey = appliedPromos.map((p) => `${p.promoCode}:${p.overrideAmount ?? ''}`).join('|');

  const query = useQuery({
    queryKey: ['checkout-pricing', activeStoreId, cartKey, promoKey],
    enabled:  items.length > 0 && !!activeStoreId,
    // Rates move intraday, but not within the seconds a checkout takes;
    // re-fetching mid-payment would change the amount under the operator.
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const split = await buildPricedLineItems({ items, activeStoreId });

      const [invoicePromoted, orderPromoted] = await Promise.all([
        split.invoice
          ? applyPromotionsToLines({
              lineItems: split.invoice.lineItems, appliedPromos,
              documentId: APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE,
            })
          : null,
        split.order
          ? applyPromotionsToLines({
              lineItems: split.order.lineItems, appliedPromos,
              documentId: APP_CONFIG.DOCUMENT_TYPES.POS_ORDER,
            })
          : null,
      ]);

      return {
        invoice: split.invoice ? { cartItems: split.invoice.cartItems, ...invoicePromoted } : null,
        order:   split.order   ? { cartItems: split.order.cartItems,   ...orderPromoted }   : null,
      };
    },
  });

  const invoiceData = query.data?.invoice ?? null;
  const orderData    = query.data?.order   ?? null;

  return {
    invoice: invoiceData ? {
      cartItems: invoiceData.cartItems,
      promotionDetails: invoiceData.promotionDetails ?? [],
      ...summarizeGroup(invoiceData.lineItems),
    } : null,
    order: orderData ? {
      cartItems: orderData.cartItems,
      promotionDetails: orderData.promotionDetails ?? [],
      ...summarizeGroup(orderData.lineItems),
    } : null,
    promoCodes: appliedPromos.map((p) => p.promoCode),
    isLoading: query.isLoading,
    error:     query.error ?? null,
  };
}
