'use client';

// Standalone cart page — reuses CartDrawer's components in a full-page layout.
// Also the navigation target checkout redirects to when the cart is empty.
// Back navigation is handled by the global Header (useSmartBack / BACK_FALLBACKS).

import { useMemo } from 'react';
import CartItemRow from '@/components/features/cart/CartItemRow';
import CartEmptyState from '@/components/features/cart/CartEmptyState';
import CartSummary from '@/components/features/cart/CartSummary';
import CartCustomerTag from '@/components/features/cart/CartCustomerTag';
import DiscountSection from '@/components/features/checkout/DiscountSection';
import ProceedToCheckoutButton from '@/components/features/cart/ProceedToCheckoutButton';
import { useCart } from '@/hooks/cart/useCart';
import { useCheckoutPricing } from '@/hooks/checkout/useCheckoutPricing';
import { buildCartDisplayRows, combineGroupTotals } from '@/services/checkoutPricingService';
import { useRedirectOnCustomerChange } from '@/hooks/checkout/useRedirectOnCustomerChange';

export default function CartPage() {
  useRedirectOnCustomerChange();

  const {
    items,
    customerName,
    customerMobile,
    isEmpty,
    removeItem,
    updateQuantity,
    detachCustomer,
  } = useCart();

  // Same pricing query DiscountSection uses (keyed on cart contents + applied
  // promo codes) — gives real per-line discounts instead of cartSlice's
  // always-0 client-side estimate, with no extra requests on checkout. A
  // mixed-stock cart line still shows as two rows here (see
  // buildCartDisplayRows) — the split is what it actually is, even before
  // checkout — but the summary below stays ONE combined total; two separate
  // documents only becomes a checkout-time concept.
  const { invoice, order, isLoading: isPricing } = useCheckoutPricing();
  const displayRows = useMemo(
    () => buildCartDisplayRows(items, { invoice, order }),
    [items, invoice, order]
  );
  const pricedTotals = (invoice || order)
    ? combineGroupTotals(invoice?.totals ?? null, order?.totals ?? null)
    : null;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-28 p-4 md:p-6">

      {isEmpty ? (
        <CartEmptyState />
      ) : (
        <>
          <CartCustomerTag
            customerName={customerName}
            customerMobile={customerMobile}
            onDetach={detachCustomer}
          />
          <DiscountSection />

          <div className="rounded-xl border border-border bg-card px-4">
            {displayRows.map((row) => (
              <CartItemRow
                key={row.key}
                item={row.item}
                displayQuantity={row.displayQuantity}
                onUpdateQuantity={updateQuantity}
                onRemove={removeItem}
                priced={row.priced}
                // Full breakdown shown on this page only — mini cart drawer omits it.
                showPriceBreakdown
                // Component-level pcs/weight subtitles — cart and checkout only, not the mini cart drawer.
                showComponentDetails
              />
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <CartSummary totals={pricedTotals} isPricing={isPricing} />
          </div>

          <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card p-4 sm:static sm:border-0 sm:bg-transparent sm:p-0">
            <div className="max-w-5xl mx-auto w-full">
              <ProceedToCheckoutButton />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
