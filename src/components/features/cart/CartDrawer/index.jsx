'use client';

// Slide-in cart panel, opened from the header cart badge.
// Uses the shared BottomSheet primitive (bottom sheet on mobile,
// right side sheet on tablet).

import { useMemo } from 'react';
import BottomSheet from '@/components/shared/BottomSheet';
import CartItemRow from '@/components/features/cart/CartItemRow';
import CartEmptyState from '@/components/features/cart/CartEmptyState';
import CartSummary from '@/components/features/cart/CartSummary';
import CartCustomerTag from '@/components/features/cart/CartCustomerTag';
import DiscountSection from '@/components/features/checkout/DiscountSection';
import ProceedToCheckoutButton from '@/components/features/cart/ProceedToCheckoutButton';
import { useCart } from '@/hooks/cart/useCart';
import { useCheckoutPricing } from '@/hooks/checkout/useCheckoutPricing';
import { buildCartDisplayRows, combineGroupTotals } from '@/services/checkoutPricingService';

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 * }} props
 */
export default function CartDrawer({ isOpen, onClose }) {
  const {
    items,
    customerName,
    customerMobile,
    isEmpty,
    removeItem,
    updateQuantity,
    detachCustomer,
  } = useCart();

  // Shared query (keyed on cart contents + applied promo codes) with
  // DiscountSection/cart page/checkout, so applying a code anywhere shows
  // up everywhere with zero extra requests. See cart/page.jsx — a split
  // line still shows as two rows here, summary stays one combined total.
  const { invoice, order, isLoading: isPricing } = useCheckoutPricing();
  const displayRows = useMemo(
    () => buildCartDisplayRows(items, { invoice, order }),
    [items, invoice, order]
  );
  const pricedTotals = (invoice || order)
    ? combineGroupTotals(invoice?.totals ?? null, order?.totals ?? null)
    : null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Cart"
      footer={
        !isEmpty && (
          <div className="flex flex-col gap-3">
            <CartSummary totals={pricedTotals} isPricing={isPricing} collapsible />
            <ProceedToCheckoutButton onNavigate={onClose} />
          </div>
        )
      }
    >
      {isEmpty ? (
        <CartEmptyState onNavigate={onClose} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <CartCustomerTag
              customerName={customerName}
              customerMobile={customerMobile}
              onDetach={detachCustomer}
            />
            <DiscountSection compact />
          </div>

          <div className="flex flex-col">
            {displayRows.map((row) => (
              <CartItemRow
                key={row.key}
                item={row.item}
                displayQuantity={row.displayQuantity}
                onUpdateQuantity={updateQuantity}
                onRemove={removeItem}
                priced={row.priced}
              />
            ))}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}