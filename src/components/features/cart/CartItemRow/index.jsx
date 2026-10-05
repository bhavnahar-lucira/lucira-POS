'use client';

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
 */
export default function CartItemRow({
  item, onUpdateQuantity, onRemove, readOnly = false, priced = null, showPriceBreakdown = false,
  showComponentDetails = false, showStockAcrossStores = false, displayQuantity = item.quantity,
}) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [stockPanelOpen, setStockPanelOpen] = useState(false);
  const {
    data: storeStocks, isLoading: stockLoading, isError: stockError, refetch: refetchStock,
  } = useStockByStores(showStockAcrossStores && stockPanelOpen ? item.itemId : null);

  const unitPrice = priced ? priced.unitPrice : item.unitPrice;
  const lineTotal = priced ? priced.lineTotal : item.unitPrice * displayQuantity;
  const imageSrc = item.image ?? null;
  const showImage = imageSrc && !imgError;

  const handleViewProduct = () => {
    if (item.itemId) router.push(`/products/${item.itemId}`);
  };
  
  const metaParts = [
    item.sizeName,
    item.attributes?.karat,
    item.attributes?.metal_color,
  ].filter(Boolean);

  const stockStatus = priced?.documentType === 'invoice' ? 'in_stock'
    : priced?.documentType === 'order' ? 'out_stock'
    : item.hasStock === true ? 'in_stock'
    : item.hasStock === false ? 'out_stock'
    : null;

  return (
    <div className="flex flex-col gap-3 py-3 border-b border-border last:border-b-0">
      <div className="flex gap-3">
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
            <Logo variant="icon" color="brown" width={24} height={24} className="opacity-40" />
          )}
        </button>
        
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
            {item.sku && (
              <p className="text-xs text-muted-foreground">Item Code: {item.sku}</p>
            )}
            
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
                onClick={() => onRemove(item, displayQuantity)}
                aria-label={`Remove ${item.itemName ?? 'item'} from cart`}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}

            <div className="text-right mt-auto">
              <p className="text-xs text-muted-foreground">
                ₹{unitPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })} each
              </p>
              <p className="text-sm font-bold text-foreground">
                ₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
              {priced?.discount > 0 && (
                <p className="text-xs font-medium text-status-in-stock">
                  −₹{priced.discount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} off
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      
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
