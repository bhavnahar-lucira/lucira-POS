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
 *   displayUnitPrice?: number|null, — tax-inclusive (net_amount) figure for
 *     the "Total" text below, separate from `unitPrice` (pre-tax, still what
 *     actually gets added to cart — see page.jsx's own comment on why those
 *     two must stay different values). Falls back to `unitPrice` if omitted.
 *   quantity: number,
 *   onQuantityChange: (n: number) => void,
 *   availableStock?: number,
 *   madeToOrderQty?: number,
 *   masterUnitPrice?: number|null, — pre-tax master rate, the ENTIRE
 *     quantity's real billing rate once madeToOrderQty > 0 (whole-line rule
 *     — see the Total calc below).
 *   masterDisplayUnitPrice?: number|null, — tax-inclusive counterpart of
 *     masterUnitPrice, for the "Total" text.
 *   product: object,
 *   selectedSizeId?: number|null,
 *   selectedSizeName?: string|null,
 *   stockStatus?: string|null, — item-level (any stock at all); this
 *     component derives the actual QUANTITY-aware verdict from it plus
 *     madeToOrderQty before handing it to AddToCartButton (see cartStockStatus).
 *   primaryImage?: object|null,
 *   pricedItem?: object|null, — live-priced SetSalesItems row (see
 *     productAttributes.js's own header) — forwarded straight through to
 *     AddToCartButton for its analytics event's price breakup.
 * }} props
 */
export default function ProductStickyActionBar({
  unitPrice,
  displayUnitPrice = unitPrice,
  quantity,
  onQuantityChange,
  availableStock = 0,
  madeToOrderQty = 0,
  masterUnitPrice = null,
  masterDisplayUnitPrice = null,
  product,
  selectedSizeId,
  selectedSizeName,
  stockStatus,
  primaryImage,
  pricedItem = null,
}) {
  // Whole-LINE rule (explicit direction, 2026-09-30): the moment quantity
  // exceeds availableStock by even one unit, checkout's own
  // buildPricedLineItems bills the ENTIRE quantity from the item master —
  // never a per-unit blend of piece price + master price. So once
  // madeToOrderQty > 0, the master rate (once it resolves) is this line's
  // one true rate, for every unit, not just the shortfall. Stays null
  // (shows "Not priced") until that resolves, rather than quoting the
  // piece rate checkout won't actually honor.
  const effectiveUnitPrice        = madeToOrderQty > 0 ? masterUnitPrice        : unitPrice;
  const effectiveDisplayUnitPrice = madeToOrderQty > 0 ? masterDisplayUnitPrice : displayUnitPrice;
  const total = effectiveDisplayUnitPrice != null ? effectiveDisplayUnitPrice * quantity : null;

  // `stockStatus` only asks "does this item have ANY stock at all", ignoring
  // how many pieces were actually requested. A line asking for more than the
  // shelf can supply is fulfilled as a whole Made-to-Order booking at
  // checkout — see checkoutPricingService.js's buildPricedLineItems, which
  // prices the ENTIRE quantity from the item master (not just the shortfall)
  // the moment even one requested piece isn't available. So the cart line
  // this Add to Cart click creates must carry that same verdict, not the
  // item-level one — reported directly (2026-09-29): added qty 2 with only 1
  // in stock, and the mini cart still showed a flat "In Stock" even though
  // this bar's own notice above already said "1 more will be Made to Order".
  const cartStockStatus = madeToOrderQty > 0 ? 'out_stock' : stockStatus;

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
              unitPrice={effectiveUnitPrice}
              selectedSizeId={selectedSizeId}
              selectedSizeName={selectedSizeName}
              primaryImage={primaryImage}
              stockStatus={cartStockStatus}
              pricedItem={pricedItem}
              disabled={effectiveUnitPrice == null}
              className="w-full sm:w-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}