'use client';

// Product detail screen — split panel with sticky add-to-cart bar, image
// zoom, and trust/certification sections. Pricing and stock status are
// always resolved live (see useVariantPricing/useStockByStores usage below)
// rather than read from stale catalog snapshot fields.

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useSelector } from 'react-redux';
import { toast }     from 'sonner';
import { useReducedMotion } from 'motion/react';

import { useProductDetail }     from '@/hooks/products/useProductDetail';
import { useStockByStores }     from '@/hooks/products/useStockByStores';
import { useDesignVariants }    from '@/hooks/products/useDesignVariants';
import { useShopifyProductImages } from '@/hooks/products/useShopifyProductImages';
import { useVariantPricing }    from '@/hooks/products/useVariantPricing';
import { useMasterPricing }     from '@/hooks/products/useMasterPricing';
import { useClaimableStock }    from '@/hooks/products/useClaimableStock';

import ProductImageGallery   from '@/components/features/products/ProductImageGallery';
import ProductSpecifications from '@/components/features/products/ProductSpecifications';
import ProductBreadcrumb     from '@/components/features/products/ProductBreadcrumb';
import ProductDetailSkeleton from '@/components/features/products/ProductDetailSkeleton';
import CrossStoreStockPanel  from '@/components/features/products/CrossStoreStockPanel';
import ProductTrustBadge     from '@/components/features/products/ProductTrustBadge';
import ProductStorySection   from '@/components/features/products/ProductStorySection';
import CustomizeSheet        from '@/components/features/products/CustomizeSheet';
import PriceBreakdown        from '@/components/features/products/PriceBreakdown';
import TodaysRateStrip       from '@/components/features/products/TodaysRateStrip';
import ProductStickyActionBar from '@/components/features/products/ProductStickyActionBar';
import ProductTrustSection   from '@/components/features/products/ProductTrustSection';
import ProductReviewsList    from '@/components/features/products/ProductReviewsList';
import ProductReviewSummaryLink from '@/components/features/products/ProductReviewSummaryLink';
import RecentlyViewedCarousel from '@/components/features/products/RecentlyViewedCarousel';
import SimilarProductsCarousel from '@/components/features/products/SimilarProductsCarousel';
import WishlistButton         from '@/components/features/products/WishlistButton';
import { useRecordProductView } from '@/hooks/products/useRecentlyViewed';
import { deriveKaratCode } from '@/lib/karat';
import { resolveImageSrc } from '@/lib/resolveImageSrc';
import { resolveActiveProductImage } from '@/lib/productImages';

import TOAST      from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS, { GA_ECOMMERCE_EVENTS } from '@/lib/analytics/events';
import { buildProductAttributes } from '@/lib/analytics/productAttributes';
import { formatPrice } from '@/lib/priceUtils';
import { Settings2, CheckCircle2, Copy, Check, Info } from 'lucide-react';

const selectActiveStoreId   = (s) => s.store.activeStoreId;
const selectActiveStoreName = (s) => s.store.activeStoreName;
const selectActiveStoreCode = (s) => s.store.activeStoreCode;
const selectCartCustomerId       = (s) => s.cart.customerId;
const selectCartCustomerName     = (s) => s.cart.customerName;
const selectCartCustomerMobile   = (s) => s.cart.customerMobile;
const selectCartCustomerAddress  = (s) => s.cart.customerAddress;

// ── Not found ─────────────────────────────────────────────────────────────────

function ProductNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
      <p className="text-lg font-semibold text-foreground">Product not found</p>
      <p className="text-sm text-muted-foreground">
        This product may have been removed or the link is invalid.
      </p>
    </div>
  );
}

// ── ProductDetailScreen ───────────────────────────────────────────────────────

function ProductDetailScreen() {
  const { itemId } = useParams();
  const activeStoreId   = useSelector(selectActiveStoreId);
  const activeStoreName = useSelector(selectActiveStoreName);
  const activeStoreCode = useSelector(selectActiveStoreCode);
  const cartCustomerId      = useSelector(selectCartCustomerId);
  const cartCustomerName    = useSelector(selectCartCustomerName);
  const cartCustomerMobile  = useSelector(selectCartCustomerMobile);
  const cartCustomerAddress = useSelector(selectCartCustomerAddress);

  // ── Server state ──────────────────────────────────────────────────────────
  const {
    data:      product,
    isLoading: detailLoading,
    isError:   detailError,
  } = useProductDetail(itemId);
  
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const reduceMotion = useReducedMotion();
  const {
    data: storeStocks = [],
    isLoading: storeStocksLoading,
    isError: storeStocksError,
    refetch: refetchStoreStocks,
  } = useStockByStores(selectedVariant?.item_id ?? product?.item_id);
  const currentStoreStock = useMemo(
    () => storeStocks.find((s) => s.company_id === activeStoreId) ?? null,
    [storeStocks, activeStoreId]
  );
  const availableStock = currentStoreStock?.pieces > 0 ? currentStoreStock.pieces : 0;
  const { claimablePieces } = useClaimableStock(
    selectedVariant?.item_id ?? product?.item_id,
    activeStoreId,
    { enabled: availableStock > 0 }
  );
  const hasUnclaimableStock = availableStock > 0 && claimablePieces != null && claimablePieces < availableStock;
  const unclaimablePieces = hasUnclaimableStock ? availableStock - claimablePieces : 0;

  // ── Variants ──────────────────────────────────────────────────────────────
  const {
    variants,
    externalProductId,
    metalColors,
    storesByItemId,
    karats,
    sizes,
    findVariant,
    hasVariants,
    isLoading: variantsLoading,
  } = useDesignVariants(product?.style_id ?? null, activeStoreId);

  const {
    images: shopifyImages, videos: shopifyVideos,
    description: shopifyDescription, isLoading: shopifyImagesLoading,
  } = useShopifyProductImages(externalProductId);
  
  const imagesLoading = variantsLoading || shopifyImagesLoading;

  useEffect(() => {
    if (detailError) toast.error(TOAST.GENERIC.SOMETHING_WRONG);
  }, [detailError]);
  
  const baseStockStatus = storeStocksLoading
    ? null
    : storeStocksError
      ? 'error'
      : availableStock > 0 ? 'in_stock' : 'out_stock';
      
  const activeItem = selectedVariant ?? product;
  
  const activePrimaryImage = useMemo(
    () => resolveActiveProductImage(shopifyImages, activeItem?.metal_color_name ?? null, activeItem, resolveImageSrc),
    [shopifyImages, activeItem]
  );
  
  const isSelectedVariantMTO = !!selectedVariant &&
    (selectedVariant._isMTO || (selectedVariant.pieces ?? 0) === 0);
    
  // customization instead of freezing on the base product.
  const stockStatus = selectedVariant
    ? (isSelectedVariantMTO ? 'out_stock' : 'in_stock')
    : baseStockStatus;

  // Karat/color/size + SKU for whichever item is active — feeds the
  // always-visible "product details" block below the price.
  const na = (v) => (v && v !== 'NA' ? v : null);
  const activeKarat = na(activeItem?.karat_name);
  const activeColor = na(activeItem?.metal_color_name);
  const activeSize  = na(activeItem?.item_size_name);
  const activeDetailsLine =
    [activeKarat, activeColor].filter(Boolean).join(' · ') +
    (activeSize ? ` · Size ${activeSize}` : '');
  const activeCode = activeItem?.item_code ?? null;

  // Copy-to-clipboard for the SKU line.
  const [skuCopied, setSkuCopied] = useState(false);
  const skuCopyTimeoutRef = useRef(null);
  useEffect(() => () => clearTimeout(skuCopyTimeoutRef.current), []);

  const handleCopySku = useCallback(async (sku) => {
    if (!sku) return;
    try {
      await navigator.clipboard.writeText(sku);
      toast.success(TOAST.CATALOG.ITEM_CODE_COPIED(sku));
      setSkuCopied(true);
      clearTimeout(skuCopyTimeoutRef.current);
      skuCopyTimeoutRef.current = setTimeout(() => setSkuCopied(false), 1500);
    } catch {
      toast.error(TOAST.CATALOG.COPY_FAILED);
    }
  }, []);
  
  const {
    data:      livePricing,
    isLoading: pricingLoading,
    isError:   pricingError,
    refetch:   refetchPricing,
  } = useVariantPricing(activeItem ?? null);

  const numericUnitPrice = (livePricing?.sub_total ?? 0) > 0
    ? livePricing.sub_total
    : null;

  const price = numericUnitPrice != null
    ? formatPrice(livePricing.net_amount)
    : null;
    
  const activeSku = livePricing?.sku && livePricing.sku.trim() ? livePricing.sku : null;
  const trackedItemIdRef = useRef(null);
  useEffect(() => {
    if (!product || numericUnitPrice == null) return;
    if (trackedItemIdRef.current === product.item_id) return;
    trackedItemIdRef.current = product.item_id;

    tracker.trackEcommerce(GA_ECOMMERCE_EVENTS.VIEW_ITEM, EVENTS.PRODUCT_VIEWED, {
      currency: 'INR',
      value:    numericUnitPrice,
      items: [{
        item_id:   String(product.item_id),
        item_name: product.item_name ?? 'Unknown Product',
        item_sku:  product.item_code ?? '',
        price:     numericUnitPrice,
      }],
    }, {
      ...buildProductAttributes({
        product,
        activeItem,
        pricedItem: livePricing,
        image: activePrimaryImage?.src ?? null,
        productUrl: product?.item_id != null
          ? `${typeof window !== 'undefined' ? window.location.origin : ''}/products/${product.item_id}`
          : null,
        selectedSizeId: activeItem?.item_size_id ?? null,
        selectedSizeName: activeSize,
        hasStock: stockStatus === 'in_stock' ? true : stockStatus === 'out_stock' ? false : null,
      }),
      product_sku: activeSku,
      product_stock_status: stockStatus,
      price_currency: 'INR',
      customer_id:              cartCustomerId ?? 'guest',
      customer_name:            cartCustomerName,
      customer_mobile:          cartCustomerMobile,
      customer_city:            cartCustomerAddress?.city,
      customer_state:           cartCustomerAddress?.state,
      customer_country:         cartCustomerAddress?.country,
      customer_zip:             cartCustomerAddress?.zip,
      store_id:                 activeStoreId,
      store_code:               activeStoreCode,
      store_name:               activeStoreName,
    });
  }, [
    product, numericUnitPrice, activeItem, activeSku, activeKarat, activeColor, activeSize,
    livePricing, activePrimaryImage, stockStatus, cartCustomerId, cartCustomerName, cartCustomerMobile,
    cartCustomerAddress, activeStoreId, activeStoreCode, activeStoreName,
  ]);
  
  const madeToOrderQty = Math.max(0, quantity - availableStock);
  const { data: masterPricing } = useMasterPricing(activeItem ?? null, madeToOrderQty > 0);
  const masterUnitPrice        = (masterPricing?.sub_total ?? 0) > 0 ? masterPricing.sub_total : null;
  const masterDisplayUnitPrice = (masterPricing?.sub_total ?? 0) > 0 ? masterPricing.net_amount : null;

  const hasCustomization = !!product?.style_id;
  useRecordProductView(product, stockStatus);
  const wishlistProduct = useMemo(() => {
    if (!activeItem?.item_id) return null;
    return {
      item_id:    activeItem.item_id,
      item_code:  activeItem.item_code  ?? product.item_code  ?? null,
      item_name:  activeItem.item_name  ?? product.item_name  ?? null,
      image:      activeItem.image      ?? product.image      ?? null,
      image_url:  activeItem.image_url  ?? product.image_url  ?? null,
      image_1:    activeItem.image_1    ?? product.image_1    ?? null,
      metal_id:   activeItem.metal_id   ?? product.metal_id   ?? null,
      karat_code: deriveKaratCode(activeItem.karat_name ?? product.karat_name),
      metal_color_code: activeItem.metal_color_code ?? product.metal_color_code ?? null,
      metal_color_name: activeItem.metal_color_name ?? product.metal_color_name ?? null,
      has_stock:  stockStatus === 'in_stock' ? true : stockStatus === 'out_stock' ? false : null,
      net_weight: activeItem.net_weight ?? product.net_weight ?? null,
      weight:     activeItem.weight     ?? product.weight     ?? null,
      style_id:   product.style_id ?? null,
      item_size_id:   selectedVariant?.item_size_id   ?? null,
      item_size_name: selectedVariant?.item_size_name ?? null,
    };
  }, [activeItem, product, selectedVariant, stockStatus]);

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const handleCustomizeConfirm = useCallback((variant) => {
    if (variant) setSelectedVariant(variant);
  }, []);

  // ── Loading / error ───────────────────────────────────────────────────────
  if (detailLoading) return <ProductDetailSkeleton />;
  if (detailError || !product) return <ProductNotFound />;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full">

      <div className="flex flex-col gap-8 pb-6 px-4 pt-4 md:gap-10 md:px-6 md:pt-5">

        <ProductBreadcrumb product={product} />

        <div className="flex flex-col xl:flex-row gap-6 md:gap-8">

          <div className="w-full xl:w-[45%] shrink-0">
            <ProductImageGallery product={activeItem} shopifyImages={shopifyImages} shopifyVideos={shopifyVideos} activeColorName={activeItem?.metal_color_name ?? null} isLoading={imagesLoading} stockStatus={stockStatus} />
          </div>

          <div className="flex flex-col gap-4 flex-1 min-w-0">

            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-4 min-w-0">
                {product.item_code && (
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {product.item_code}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopySku(product.item_code)}
                      aria-label={`Copy item code ${product.item_code}`}
                      title="Copy item code"
                      className="flex items-center justify-center w-5 h-5 shrink-0 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {skuCopied
                        ? <Check size={12} className="text-status-in-stock" aria-hidden="true" />
                        : <Copy size={12} aria-hidden="true" />}
                    </button>
                  </div>
                )}

                <h1 className="font-heading text-xl text-foreground leading-snug md:text-3xl">
                  {product.item_name ?? 'Product'}
                </h1>

                {/* Click smooth-scrolls to Customer Reviews at the bottom; hidden when there are none. */}
                <ProductReviewSummaryLink shopifyProductId={externalProductId} />
              </div>

              {wishlistProduct && (
                <WishlistButton
                  product={wishlistProduct}
                  reduceMotion={reduceMotion}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              )}
            </div>

            {/* No strikethrough/"% OFF": compare_price is a stale master field —
                showing a discount against a mismatched figure is worse than none. */}
            <div>
              <div className="flex items-baseline gap-2">
                {pricingLoading ? (
                  <p className="text-sm font-medium text-muted-foreground">Calculating live price…</p>
                ) : price ? (
                  <p className="font-heading text-3xl text-primary">{price}</p>
                ) : pricingError ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-status-made-order">
                    Could not calculate live price
                    <button
                      type="button"
                      onClick={() => refetchPricing()}
                      className="font-semibold underline underline-offset-2 hover:text-status-made-order/80"
                    >
                      Retry
                    </button>
                  </p>
                ) : (
                  // Server prices this at 0 (currently every Silver925 item on
                  // this tenant — OrnaVerse's own POS also totals it at 0).
                  <p className="text-sm font-medium text-status-made-order">
                    Price not available for this option — needs costing before it can be sold
                  </p>
                )}
              </div>
            </div>

            {stockStatus === 'in_stock' && activeStoreName && (
              <div className="flex items-center gap-2.5 rounded-xl bg-status-in-stock/10 border border-status-in-stock/20 px-4 py-3">
                <CheckCircle2 size={18} className="shrink-0 text-status-in-stock" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-status-in-stock">
                    In stock at {activeStoreName}
                  </p>
                  <p className="text-xs text-status-in-stock/70">
                    Ready to bill · take home today
                  </p>
                </div>
              </div>
            )}
            
            {hasUnclaimableStock && (
              <div className="flex items-center gap-2.5 rounded-xl bg-status-made-order/10 border border-status-made-order/20 px-4 py-3">
                <Info size={18} className="shrink-0 text-status-made-order" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-status-made-order">
                    {claimablePieces === 0
                      ? `Not actually billable today`
                      : `${unclaimablePieces} of ${availableStock} shown here ${unclaimablePieces === 1 ? "isn't" : "aren't"} billable today`}
                  </p>
                  <p className="text-xs text-status-made-order/70">
                    {claimablePieces === 0
                      ? `This piece can't be billed today — it may already be reserved by another sale, or not yet tagged for sale. It will book as Made to Order until that clears.`
                      : `Only ${claimablePieces} of ${availableStock} can actually be billed today — the rest will book as Made to Order.`}
                  </p>
                </div>
              </div>
            )}
            
            {(activeDetailsLine || activeCode) && (
              <div className="rounded-xl bg-secondary/40 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  {activeDetailsLine && (
                    <p className="font-medium text-foreground">{activeDetailsLine}</p>
                  )}
                  {stockStatus && (
                    <span
                      className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold ${
                        stockStatus === 'error' ? 'text-status-made-order'
                        : stockStatus === 'out_stock' ? 'text-status-error'
                        : 'text-status-in-stock'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          stockStatus === 'error' ? 'bg-status-made-order'
                          : stockStatus === 'out_stock' ? 'bg-status-error'
                          : 'bg-status-in-stock'
                        }`}
                        aria-hidden="true"
                      />
                      {stockStatus === 'error' ? 'Stock Unknown' : stockStatus === 'out_stock' ? 'Made to Order' : 'In Stock'}
                    </span>
                  )}
                </div>
                {activeCode && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Item Code: {activeCode}
                    {activeSku && <> · SKU: {activeSku}</>}
                  </p>
                )}
              </div>
            )}

            {hasCustomization && (
              <button
                type="button"
                onClick={() => setCustomizeOpen(true)}
                className="
                  flex items-center justify-between w-full
                  px-4 py-3 rounded-xl min-h-[48px]
                  border border-accent/40 bg-accent/5
                  hover:border-accent hover:bg-accent/10 active:bg-accent/15
                  transition-colors
                "
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Settings2 size={16} className="text-accent shrink-0" />
                  {selectedVariant ? 'Change Customization' : 'Customize this piece'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedVariant
                    ? `${selectedVariant.karat_name} · ${selectedVariant.metal_color_name}`
                    : 'Metal · Size'
                  }
                </span>
              </button>
            )}

            {stockStatus === 'out_stock' && (
              <p className="text-sm text-primary">
                This item is currently out of stock — can be ordered as Made to Order.
              </p>
            )}
            
            {stockStatus === 'error' && (
              <p className="flex items-center gap-2 text-sm font-medium text-status-made-order">
                Couldn&apos;t check stock for this item
                <button
                  type="button"
                  onClick={() => refetchStoreStocks()}
                  className="font-semibold underline underline-offset-2 hover:text-status-made-order/80"
                >
                  Retry
                </button>
              </p>
            )}

            {/* Hidden once the confirmed customization is Made to Order (no real stock anywhere to report). */}
            {!isSelectedVariantMTO && (
              <CrossStoreStockPanel
                storeStocks={storeStocks}
                isLoading={storeStocksLoading}
                isError={storeStocksError}
                onRetry={refetchStoreStocks}
              />
            )}
            
            <TodaysRateStrip />
            
            {numericUnitPrice != null && <PriceBreakdown priced={livePricing} showComponents />}

          </div>
        </div>

        <ProductTrustBadge />

        <ProductStorySection body={shopifyDescription} isLoading={imagesLoading} product={product} />

        <ProductSpecifications product={activeItem} pricedItem={livePricing} />

        {/* Reuses externalProductId already resolved for Shopify images — no extra OrnaVerse calls. */}
        <ProductReviewsList shopifyProductId={externalProductId} />
        
        <SimilarProductsCarousel product={product} activeStoreId={activeStoreId} />

        <ProductTrustSection />        

        {/* Only ever populated for an attached customer — see useRecordProductView above. */}
        <RecentlyViewedCarousel excludeItemId={product.item_id} />

      </div>

      <ProductStickyActionBar
        unitPrice={numericUnitPrice}
        displayUnitPrice={numericUnitPrice != null ? livePricing.net_amount : null}
        quantity={quantity}
        onQuantityChange={setQuantity}
        availableStock={availableStock}
        madeToOrderQty={madeToOrderQty}
        masterUnitPrice={masterUnitPrice}
        masterDisplayUnitPrice={masterDisplayUnitPrice}
        product={activeItem}
        selectedSizeId={selectedVariant?.item_size_id ?? null}
        selectedSizeName={selectedVariant?.item_size_name ?? null}
        stockStatus={stockStatus}
        primaryImage={activePrimaryImage}
        pricedItem={livePricing}
      />

      <CustomizeSheet
        isOpen={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        product={product}
        selectedVariant={selectedVariant}
        variants={variants}
        metalColors={metalColors}
        karats={karats}
        sizes={sizes}
        storesByItemId={storesByItemId}
        findVariant={findVariant}
        onConfirm={handleCustomizeConfirm}
        isLoading={variantsLoading}
        activeStoreId={activeStoreId}
        activeStoreName={activeStoreName}
      />

    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  return (
    <Suspense fallback={<ProductDetailSkeleton />}>
      <ProductDetailScreen />
    </Suspense>
  );
}