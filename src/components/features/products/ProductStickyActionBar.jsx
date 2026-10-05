'use client';

import { PackagePlus } from 'lucide-react';
import QuantitySelector  from '@/components/features/products/QuantitySelector';
import AddToCartButton   from '@/components/features/products/AddToCartButton';
import { formatAmountOrNull as formatINR } from '@/lib/priceUtils';

const QUANTITY_CEILING = 99;

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
  
  const effectiveUnitPrice        = madeToOrderQty > 0 ? masterUnitPrice        : unitPrice;
  const effectiveDisplayUnitPrice = madeToOrderQty > 0 ? masterDisplayUnitPrice : displayUnitPrice;
  const total = effectiveDisplayUnitPrice != null ? effectiveDisplayUnitPrice * quantity : null;
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