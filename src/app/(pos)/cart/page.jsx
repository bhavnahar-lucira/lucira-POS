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
import { mapPricedLinesToCart } from '@/services/checkoutPricingService';
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
  // always-0 client-side estimate, with no extra requests on checkout.
  const { lineItems: pricedLineItems, totals: pricedTotals, isLoading: isPricing } = useCheckoutPricing();
  const pricedByCartIndex = useMemo(
    () => mapPricedLinesToCart(items, pricedLineItems),
    [items, pricedLineItems]
  );

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
            {items.map((item, index) => (
              <CartItemRow
                key={`${item.itemId}-${item.sizeId}-${item.styleId}`}
                item={item}
                onUpdateQuantity={updateQuantity}
                onRemove={removeItem}
                // Per-line discount breakdown, keyed by cart index (see CartItemRow).
                priced={pricedByCartIndex.get(index) ?? null}
                // Full breakdown shown on this page only — mini cart drawer omits it.
                showPriceBreakdown
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
