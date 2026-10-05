'use client';

import { useMemo } from 'react';
import CartItemRow from '@/components/features/cart/CartItemRow';
import CartEmptyState from '@/components/features/cart/CartEmptyState';
import CartSummary from '@/components/features/cart/CartSummary';
import CartCustomerTag from '@/components/features/cart/CartCustomerTag';
import DiscountSection from '@/components/features/checkout/DiscountSection';
import ProceedToCheckoutButton from '@/components/features/cart/ProceedToCheckoutButton';
import { useCart } from '@/hooks/cart/useCart';
import { useCheckoutPricing } from '@/hooks/checkout/useCheckoutPricing';
import { buildCartDisplayRows, combineGroupTotals, getPromoBreakdown } from '@/services/checkoutPricingService';
import { useRedirectOnCustomerChange } from '@/hooks/checkout/useRedirectOnCustomerChange';

export default function CartPage() {
  useRedirectOnCustomerChange();

  const {
    items,
    appliedPromos,
    customerName,
    customerMobile,
    isEmpty,
    removeItem,
    updateQuantity,
    detachCustomer,
  } = useCart();
  
  const { invoice, order, isLoading: isPricing } = useCheckoutPricing();
  const displayRows = useMemo(
    () => buildCartDisplayRows(items, { invoice, order }),
    [items, invoice, order]
  );
  const pricedTotals = (invoice || order)
    ? combineGroupTotals(invoice?.totals ?? null, order?.totals ?? null)
    : null;
    
  const discountBreakdown = getPromoBreakdown(appliedPromos, [
    ...(invoice?.promotionDetails ?? []),
    ...(order?.promotionDetails ?? []),
  ]);

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
                // Same "available at other stores" panel the PDP shows, per line — cart and checkout only.
                showStockAcrossStores
              />
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <CartSummary totals={pricedTotals} isPricing={isPricing} discountBreakdown={discountBreakdown} />
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
