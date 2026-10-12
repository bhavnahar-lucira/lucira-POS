import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import {
  buildPricedLineItems,
  applyPromotionsToLines,
  summarizeLineItems,
} from '@/services/checkoutPricingService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { useCart } from '@/hooks/cart/useCart';
import { roundToNearestRupee } from '@/lib/priceUtils';
import APP_CONFIG from '@/constants/appConfig';

// Quantity-stepper clicks update Redux (and so `items`) on every single click,
// with nothing to stop N rapid clicks from firing N full re-pricing passes —
// each one a real StockJournal/SetSalesItems/ApplyPromotions round trip, all
// racing. Reported directly (2026-10-08): bumping a gold-coin line's quantity
// from 1 to 25 queued ~15 overlapping passes, and briefly rendered as if the
// cart had fallen to Made-to-Order (no SKUs, discount gone, promo-removal
// toasts) before the final pass settled — not a pricing or promotion bug, a
// thundering-herd one. Debouncing `items` so only the quiet-period-final
// quantity ever reaches the query closes it at the root.
const DEBOUNCE_MS = 400;

function summarizeGroup(lineItems) {
  const totals = summarizeLineItems(lineItems);
  return {
    lineItems,
    totals,
    amountDue: roundToNearestRupee(totals.netAmount),
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

  // items and appliedPromos are debounced TOGETHER, as one snapshot — a
  // promo that adds its own free-gift cart line changes both in the same
  // dispatch, and debouncing only `items` (as this used to) let the OTHER
  // one — appliedPromos, undebounced — reach the query a full 400ms before
  // the matching item line did. That fired a real ApplyPromotions call
  // carrying the new promo against the OLD item list (no free-gift line
  // yet), which OrnaVerse correctly rejects with "Free gift items not found
  // in the transaction" — and the cleanup effect then removes the promo it
  // just added. Confirmed live (2026-10-12): this reproduced the "applied
  // then instantly removed, can't reapply" symptom with no abandoned-cart
  // merge involved at all. Debouncing both together means the query only
  // ever sees a cart+promo pair that were already stable side by side.
  const [debounced, setDebounced] = useState({ items, appliedPromos });
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced({ items, appliedPromos }), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [items, appliedPromos]);

  const debouncedItems = debounced.items;
  const debouncedPromos = debounced.appliedPromos;
  const cartKey  = debouncedItems.map((i) => `${i.itemId}x${i.quantity}`).join('|');
  const promoKey = debouncedPromos.map((p) => `${p.promoCode}:${p.overrideAmount ?? ''}`).join('|');

  const query = useQuery({
    queryKey: ['checkout-pricing', activeStoreId, cartKey, promoKey],
    enabled:  debouncedItems.length > 0 && !!activeStoreId,
    // NOT 5 minutes (as this used to be) — confirmed live (2026-10-12) this
    // is a real root cause of "the gold coin won't reapply": the first
    // attempt at a given {cart composition, promo} pair can genuinely fail
    // for a transient reason (a stock claim briefly short, a promotion
    // eligibility edge), and OrnaVerse's own live state (stock, rates) can
    // change moment to moment regardless. With a 5-minute staleTime, ARRIVING
    // BACK at that exact same pair (e.g. remove an item then re-add it, or
    // empty the cart and re-add the same products) just replays the old
    // cached failure instead of genuinely re-pricing — looks permanently
    // broken for that composition until the 5 minutes pass. Checkout pricing
    // must always reflect live state; this query is never worth serving
    // stale for the sake of avoiding one extra round trip.
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const split = await buildPricedLineItems({ items: debouncedItems, activeStoreId });

      const [invoicePromoted, orderPromoted] = await Promise.all([
        split.invoice
          ? applyPromotionsToLines({
              lineItems: split.invoice.lineItems, appliedPromos: debouncedPromos,
              documentId: APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE,
            })
          : null,
        split.order
          ? applyPromotionsToLines({
              lineItems: split.order.lineItems, appliedPromos: debouncedPromos,
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

  // True for the whole debounce window after items/appliedPromos change,
  // not just while the query itself is actively fetching. Reported directly
  // (2026-10-12): applying ANY promo updates the live `appliedPromos`
  // immediately, but `invoiceData.promotionDetails` above is still the
  // PREVIOUS (pre-apply) result until the debounced snapshot catches up and
  // the query re-fires — during that gap, query.isLoading reads false (it's
  // not fetching, it's just showing stale cached data), so every cleanup
  // effect in DiscountSection saw "this promo has no effect yet" and removed
  // it on the spot, for every promo, every time. isLoading must cover this
  // gap too, or callers act on a result that doesn't correspond to the live
  // cart/promo state yet.
  const isDebouncePending = debouncedItems !== items || debouncedPromos !== appliedPromos;

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
    isLoading: query.isLoading || isDebouncePending,
    error:     query.error ?? null,
  };
}
