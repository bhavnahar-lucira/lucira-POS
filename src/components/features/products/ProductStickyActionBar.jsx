'use client';

// Quantity is intentionally NOT capped by physical stock — customers can
// order more than what's on the shelf; anything beyond availableStock is
// fulfilled as Made to Order. We surface that as a clear, non-blocking
// notice rather than disabling the stepper or the Add to Cart button.

import { PackagePlus } from 'lucide-react';
import QuantitySelector  from '@/components/features/products/QuantitySelector';
import AddToCartButton   from '@/components/features/products/AddToCartButton';
import { formatAmountOrNull as formatINR } from '@/lib/priceUtils';

// Sane upper bound for the stepper itself — not a stock cap, just a
// reasonable ceiling to stop the +/- control scrolling forever.
const QUANTITY_CEILING = 99;

// FIXED 2026-09-08 — was maximumFractionDigits: 0 ("whole rupees, matching
// the headline price on the page behind this bar"), but that headline
// price (src/lib/priceUtils.js's formatPrice) was itself rounding the same
// way — both disagreed with PriceBreakdown's exact-decimal Subtotal for
// the identical underlying field (livePricing.sub_total), by design intent
// ("matching") rather than by accident, but the thing they were matching
// was also wrong. Now shows the same 2-decimal precision as the rest of
// the app (CartSummary, PriceBreakdown, checkout) — no whole-rupee
// round_off adjustment applies here the way it does on a real invoice
// total (see CartSummary's own header for that distinction); this is
// purely a display figure.
//
// DE-DUPLICATED 2026-09-08 — was its own local function identical to
// lib/priceUtils.js's formatAmountOrNull; imported (aliased) instead.

/**
 * @param {{
 *   unitPrice: number|null,
 *   quantity: number,
 *   onQuantityChange: (n: number) => void,
 *   availableStock?: number,
 *   madeToOrderQty?: number,
 *   product: object,
 *   selectedSizeId?: number|null,
 *   selectedSizeName?: string|null,
 *   stockStatus?: string|null,
 *   primaryImage?: object|null,
 *   pricedItem?: object|null, — live-priced SetSalesItems row (see
 *     productAttributes.js's own header) — forwarded straight through to
 *     AddToCartButton for its analytics event's price breakup.
 * }} props
 */
export default function ProductStickyActionBar({
  unitPrice,
  quantity,
  onQuantityChange,
  availableStock = 0,
  madeToOrderQty = 0,
  product,
  selectedSizeId,
  selectedSizeName,
  stockStatus,
  primaryImage,
  pricedItem = null,
}) {
  const total = unitPrice != null ? unitPrice * quantity : null;

  return (
    <div className="sticky bottom-0 left-0 right-0 z-20 border-t border-border bg-card px-4 py-3 md:px-6">
      <div className="max-w-full mx-auto">

        {madeToOrderQty > 0 && (
          <div className="flex items-center gap-1.5 mb-2 text-xs text-status-made-order">
            <PackagePlus size={13} className="shrink-0" aria-hidden="true" />
            <span>
              {availableStock > 0
                ? `${availableStock} available now · ${madeToOrderQty} more will be Made to Order`
                : `All ${madeToOrderQty} will be Made to Order`}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 md:justify-between sm:flex-nowrap sm:justify-start sm:gap-3">

          <div className="shrink-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Total
            </p>
            <p className="font-heading text-base text-foreground leading-tight sm:text-xl">
              {total != null ? formatINR(total) : (
                <span className="text-sm font-medium text-status-made-order">Not priced</span>
              )}
            </p>
          </div>

          <div className='flex items-center gap-3'>

            <div className="shrink-0 sm:ml-auto">
              <QuantitySelector
                quantity={quantity}
                onChange={onQuantityChange}
                maxQty={QUANTITY_CEILING}
              />
            </div>
            <AddToCartButton
              product={product}
              quantity={quantity}
              unitPrice={unitPrice}
              selectedSizeId={selectedSizeId}
              selectedSizeName={selectedSizeName}
              primaryImage={primaryImage}
              stockStatus={stockStatus}
              pricedItem={pricedItem}
              disabled={unitPrice == null}
              className="w-full sm:w-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}