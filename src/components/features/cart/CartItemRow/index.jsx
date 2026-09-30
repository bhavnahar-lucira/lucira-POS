'use client';

// Single cart line item: image, name, SKU, an In Stock/Made to Order badge,
// attributes, quantity control, unit price, line total, a remove action, and
// (opt-in, see showPriceBreakdown below) the full per-product cost breakup,
// collapsed behind a toggle by default.
//
// readOnly hides the qty stepper (shows a plain "N ×" label instead) — used
// to reuse this row on Checkout's "Order Items" summary. Removing a line is
// independent of readOnly: the trash icon shows whenever onRemove is passed,
// regardless of whether quantity is editable.

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Trash2, Coins, Store, ChevronDown } from 'lucide-react';
import Logo from '@/components/shared/Logo';
import StockStatusBadge from '@/components/shared/StockStatusBadge';
import CartItemQuantityControl from '@/components/features/cart/CartItemQuantityControl';
import PriceBreakdown from '@/components/features/products/PriceBreakdown';
import CrossStoreStockPanel from '@/components/features/products/CrossStoreStockPanel';
import { useStockByStores } from '@/hooks/products/useStockByStores';
import { cn } from '@/lib/utils';
import { isShopifyImageUrl, shopifyImageLoader } from '@/lib/shopifyImageLoader';

/**
 * @param {{
 *   item: object,
 *   onUpdateQuantity?: (item: object, quantity: number) => void,
 *   onRemove?: (item: object, displayQuantity?: number) => void,
 *   readOnly?: boolean,
 *   priced?: { lineTotal: number, unitPrice: number, discount: number, skus: string[], breakdown: object } | null,
 *   showPriceBreakdown?: boolean,
 *   showComponentDetails?: boolean,
 *   displayQuantity?: number,
 * }} props
 *   priced - what this line is actually being sold at, from
 *   useCheckoutPricing; wins over the cart's own figure. The cart price is
 *   the item master's nominal spec, but a sale bills the physical piece,
 *   whose real weight decides the price — the master and the actual piece
 *   can differ materially, so the SKU of the actual piece is shown too.
 *
 *   showPriceBreakdown (default false) - makes available the same Metal/
 *   Diamond/.../Total(incl. GST) card the product detail page shows,
 *   sourced from priced.breakdown. Cart page and checkout's "Order Items"
 *   summary opt in; the mini cart drawer does not (quick glance/edit
 *   surface only). Collapsed behind a per-line toggle by default, local to
 *   this row's mount — survives a quantity change on the same line, resets
 *   only if the row is removed and re-added.
 *
 *   displayQuantity (default item.quantity) — the count THIS ROW shows/
 *   prices. Differs from item.quantity when buildCartDisplayRows had to
 *   split one cart line into two rows (part in stock, part not) — each
 *   half shows only its own portion here, while the quantity STEPPER below
 *   still increments/decrements the real, whole line (item.quantity), never
 *   this display-only count, so "+1" always means "one more of this
 *   product", not "one more of just this half".
 *
 *   showComponentDetails (default false) - adds the piece-count/weight
 *   subtitle behind each PriceBreakdown amount (e.g. "76 pcs · 1.93 ct"
 *   under Diamond). Cart page and checkout's Order Items summary opt in;
 *   the mini cart drawer never passes this.
 *
 *   showStockAcrossStores (default false) - reuses the product detail
 *   page's own CrossStoreStockPanel per line, so cart/checkout show the
 *   same "available at other stores" data the PDP already does, instead of
 *   the operator having to reopen each product to check. Cart page and
 *   checkout's Order Items summary opt in; the mini cart drawer doesn't
 *   (quick glance surface, and this panel needs real width to read).
 */
export default function CartItemRow({
  item, onUpdateQuantity, onRemove, readOnly = false, priced = null, showPriceBreakdown = false,
  showComponentDetails = false, showStockAcrossStores = false, displayQuantity = item.quantity,
}) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [stockPanelOpen, setStockPanelOpen] = useState(false);
  // Deferred until actually opened (stockPanelOpen), not just showStockAcrossStores
  // being true — same "collapsed by default" idea as the price breakdown,
  // but this one's a real network fetch, so there's no reason to fire it
  // for every line the moment the page mounts.
  const {
    data: storeStocks, isLoading: stockLoading, isError: stockError, refetch: refetchStock,
  } = useStockByStores(showStockAcrossStores && stockPanelOpen ? item.itemId : null);

  const unitPrice = priced ? priced.unitPrice : item.unitPrice;
  const lineTotal = priced ? priced.lineTotal : item.unitPrice * displayQuantity;
  // item.image is already a fully-resolved src by the time it lands here
  // (resolved once at cart-populating time) — do not run it through
  // resolveImageSrc again here; a second pass on an already-resolved
  // relative path is not idempotent and can produce a 404ing path.
  const imageSrc = item.image ?? null;
  const showImage = imageSrc && !imgError;

  const handleViewProduct = () => {
    if (item.itemId) router.push(`/products/${item.itemId}`);
  };

  // item.attributes fields are snake_case (buildProductAttributes writes
  // metal_color, not metalColor) — using the wrong case silently reads undefined.
  const metaParts = [
    item.sizeName,
    item.attributes?.karat,
    item.attributes?.metal_color,
  ].filter(Boolean);

  // priced.documentType (set by checkoutPricingService's
  // buildCartDisplayRows, once pricing resolves) is the fresh,
  // authoritative verdict — which of the two real documents this exact
  // quantity will actually be billed through — and wins over the stale
  // add-to-cart-time hasStock flag whenever it's available. Falls back to
  // hasStock only while pricing hasn't resolved yet (or wasn't captured at
  // all — order fulfillment, abandoned-cart restore); null renders no badge.
  const stockStatus = priced?.documentType === 'invoice' ? 'in_stock'
    : priced?.documentType === 'order' ? 'out_stock'
    : item.hasStock === true ? 'in_stock'
    : item.hasStock === false ? 'out_stock'
    : null;

  return (
    <div className="flex flex-col gap-3 py-3 border-b border-border last:border-b-0">
      <div className="flex gap-3">
        {/* Thumbnail — clickable through to the product page, same target
            as the name button below. */}
        <button
          type="button"
          onClick={handleViewProduct}
          disabled={!item.itemId}
          aria-label={`View ${item.itemName ?? 'product'}`}
          className="relative shrink-0 h-16 w-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          {showImage ? (
            <Image
              src={imageSrc}
              alt={item.itemName ?? 'Product image'}
              fill
              sizes="64px"
              className="object-cover"
              loading="lazy"
              fetchPriority="low"
              onError={() => setImgError(true)}
              loader={isShopifyImageUrl(imageSrc) ? shopifyImageLoader : undefined}
            />
          ) : (
            // Same Logo asset as ProductCard/ProductImageGallery's no-image
            // state — a missing photo is expected, not an error.
            <Logo variant="icon" color="brown" width={24} height={24} className="opacity-40" />
          )}
        </button>

        {/* Two-column split: left = product details stacked tight; right =
            remove button pinned top, price pinned bottom (mt-auto). */}
        <div className="flex-1 min-w-0 flex justify-between gap-2">
          <div className="min-w-0 flex flex-col gap-1">
            <button
              type="button"
              onClick={handleViewProduct}
              disabled={!item.itemId}
              className="text-left text-sm font-semibold text-foreground leading-snug line-clamp-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm disabled:cursor-default disabled:hover:no-underline"
            >
              {item.itemName ?? 'Unknown Product'}
            </button>

            {/* item.sku is the catalog code (item_code), not a real
                per-piece sku — labeled "Item Code" to avoid confusion with
                the scannable one below. */}
            {item.sku && (
              <p className="text-xs text-muted-foreground">Item Code: {item.sku}</p>
            )}

            {/* The physical piece(s) this line will consume — the real,
                scannable sku(s), from useCheckoutPricing. Empty for an
                order (a booking), since only an invoice claims stock. */}
            {priced?.skus?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                SKU{priced.skus.length > 1 ? 's' : ''}: {priced.skus.join(', ')}
              </p>
            )}

            {metaParts.length > 0 && (
              <p className="text-xs text-muted-foreground">{metaParts.join(' • ')}</p>
            )}

            {stockStatus && (
              <div>
                <StockStatusBadge status={stockStatus} size="sm" />
              </div>
            )}

            <div className="mt-1">
              {readOnly ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {displayQuantity} ×
                </span>
              ) : (
                <CartItemQuantityControl
                  quantity={displayQuantity}
                  onIncrement={() => onUpdateQuantity(item, item.quantity + 1)}
                  onDecrement={() => onUpdateQuantity(item, item.quantity - 1)}
                />
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end">
            {onRemove && (
              <button
                type="button"
                // displayQuantity, not item.quantity — a row split by
                // buildCartDisplayRows (part in stock, part made-to-order)
                // must only remove its OWN portion; see cartSlice.removeItem.
                onClick={() => onRemove(item, displayQuantity)}
                aria-label={`Remove ${item.itemName ?? 'item'} from cart`}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}

            <div className="text-right mt-auto">
              {/* Capped at 2dp: live prices carry fractional paise
                  (226444.105), and the default shows 3 — "₹2,26,444.105 each"
                  reads like a rendering fault next to a rounded total. */}
              <p className="text-xs text-muted-foreground">
                ₹{unitPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })} each
              </p>
              <p className="text-sm font-bold text-foreground">
                ₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
              {/* Per-line share of the cart's discount (2026-08-26) — how much
                  of an applied promo landed on THIS piece specifically, not
                  just the cart-wide total. A component-scoped promo ("20% Off
                  Diamond") can legitimately give ₹0 here on a line with no
                  diamond even while it discounts a different line — that's
                  correct, so this only renders when this line got something. */}
              {priced?.discount > 0 && (
                <p className="text-xs font-medium text-status-in-stock">
                  −₹{priced.discount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} off
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full per-product cost breakup (2026-08-26), collapsed behind a
          toggle by default (2026-09-09 — see this prop's own JSDoc). Same
          card the product detail page shows, reused verbatim. Nothing to
          show until pricing has actually resolved this line
          (priced?.breakdown), same gate PriceBreakdown itself applies for a
          null `priced` — the toggle itself only renders once there's
          something real behind it. */}
      {showPriceBreakdown && priced?.breakdown && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setBreakdownOpen((open) => !open)}
            aria-expanded={breakdownOpen}
            className="flex w-fit items-center gap-1.5 text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <Coins size={12} aria-hidden="true" />
            {breakdownOpen ? 'Hide Price Breakdown' : 'View Price Breakdown'}
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={cn('transition-transform', breakdownOpen && 'rotate-180')}
            />
          </button>
          {breakdownOpen && <PriceBreakdown priced={priced.breakdown} showComponents={showComponentDetails} />}
        </div>
      )}

      {/* Same collapsed-by-default toggle as the price breakdown above —
          reported directly (2026-09-30). Fetch itself is deferred until
          first opened (see stockPanelOpen in the useStockByStores call). */}
      {showStockAcrossStores && item.itemId && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setStockPanelOpen((open) => !open)}
            aria-expanded={stockPanelOpen}
            className="flex w-fit items-center gap-1.5 text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <Store size={12} aria-hidden="true" />
            {stockPanelOpen ? 'Hide Stock Across Stores' : 'View Stock Across Stores'}
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={cn('transition-transform', stockPanelOpen && 'rotate-180')}
            />
          </button>
          {stockPanelOpen && (
            <CrossStoreStockPanel
              storeStocks={storeStocks}
              isLoading={stockLoading}
              isError={stockError}
              onRetry={refetchStock}
              collapsible={false}
            />
          )}
        </div>
      )}
    </div>
  );
}
