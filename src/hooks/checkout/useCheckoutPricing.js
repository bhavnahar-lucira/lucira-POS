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
  const cartKey  = items.map((i) => `${i.itemId}x${i.quantity}`).join('|');
  const promoKey = appliedPromos.map((p) => `${p.promoCode}:${p.overrideAmount ?? ''}`).join('|');

  const query = useQuery({
    queryKey: ['checkout-pricing', activeStoreId, cartKey, promoKey],
    enabled:  items.length > 0 && !!activeStoreId,
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
