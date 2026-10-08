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

  const [debouncedItems, setDebouncedItems] = useState(items);
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedItems(items), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [items]);

  const cartKey  = debouncedItems.map((i) => `${i.itemId}x${i.quantity}`).join('|');
  const promoKey = appliedPromos.map((p) => `${p.promoCode}:${p.overrideAmount ?? ''}`).join('|');

  const query = useQuery({
    queryKey: ['checkout-pricing', activeStoreId, cartKey, promoKey],
    enabled:  debouncedItems.length > 0 && !!activeStoreId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const split = await buildPricedLineItems({ items: debouncedItems, activeStoreId });

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
