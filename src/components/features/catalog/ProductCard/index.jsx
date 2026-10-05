'use client';

import { useState, memo }  from 'react';
import Image               from 'next/image';
import { useRouter }       from 'next/navigation';
import { useSelector }     from 'react-redux';
import { motion, useReducedMotion } from 'motion/react';
import { PlayingCardsFan } from 'lucide-react';
import { resolveImageSrc } from '@/lib/resolveImageSrc';
import { resolveMetalColorName } from '@/lib/metalColor';
import { selectActiveStoreCode, selectActiveStoreId } from '@/store/slices/storeSlice';
import APP_CONFIG          from '@/constants/appConfig';
import Logo                from '@/components/shared/Logo';
import StarRating          from '@/components/shared/StarRating';
import { useStyleExternalProductId } from '@/hooks/products/useStyleExternalProductId';
import { useProductReviewSummary }   from '@/hooks/products/useProductReviewSummary';
import { useSimilarProducts } from '@/hooks/products/useSimilarProducts';
import WishlistButton       from '@/components/features/products/WishlistButton';
import SimilarProductsSheet from '@/components/features/catalog/SimilarProductsSheet';
import { Badge } from '@/components/ui/badge';
import { EASE_PREMIUM, DURATION } from '@/lib/motion';
import { formatAmountOrNull as formatINR } from '@/lib/priceUtils';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import { buildProductAttributes } from '@/lib/analytics/productAttributes';

// Swatch colors are a presentational mapping only — metal_id itself is real data.
const METAL_ID_TO_NAME = Object.fromEntries(
  Object.entries(APP_CONFIG.METAL_TYPES).map(([name, id]) => [
    id,
    name.charAt(0) + name.slice(1).toLowerCase(),
  ])
);

function getMetalLabel(metal_id) {
  return metal_id ? METAL_ID_TO_NAME[metal_id] ?? null : null;
}

function formatWeight(grams) {
  if (!grams && grams !== 0) return null;
  const n = Number(grams);
  if (isNaN(n) || n === 0) return null;
  return `${n.toFixed(3)} g`;
}

function NoImagePlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted">
      <Logo
        variant="icon"
        color="brown"
        width={32}
        height={32}
        className="opacity-40"
      />
      <span className="text-[10px] text-muted-foreground/60 tracking-wide">No image</span>
    </div>
  );
}

function StockBadge({ inStock, storeCodes }) {
  const [firstCode, ...restCodes] = storeCodes ?? [];
  return (
    <Badge
      className={[
        'h-auto rounded-l-none rounded-r-full py-0.5 pl-2 pr-2.5 text-[10px] font-semibold text-white shadow-sm sm:py-1 sm:pl-2.5 sm:pr-3 sm:text-[11px]',
        inStock ? 'bg-status-in-stock/95' : 'bg-status-error/95',
      ].join(' ')}
    >
      {inStock ? 'In Stock' : 'Made to Order'}
      {inStock && firstCode && (
        <span className="ml-1.5 inline-flex items-center gap-1.5 font-bold">
          <span className="opacity-90">· {firstCode}</span>
          {restCodes.length > 0 && (
            <>
              <span className="h-2.5 w-px bg-white/40" aria-hidden="true" />
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] leading-none">
                +{restCodes.length}
              </span>
            </>
          )}
        </span>
      )}
    </Badge>
  );
}

/**
 * @param {{
 *   product: object,
 *   showStockBadge?: boolean,
 *   storeCode?: string,
 *   realStock?: { hasStock: boolean, storeCodes: string[] } | null,
 *   showSimilarIcon?: boolean,
 *   similarProductsSurface?: 'sheet' | 'pdp_carousel' | null,
 *   priorityImage?: boolean,
 * }} props
 */
function ProductCard({
  product,
  showStockBadge = false,
  storeCode: storeCodeOverride,
  realStock = null,
  showSimilarIcon = true,
  similarProductsSurface = null,
  priorityImage = false,
}) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const [isSimilarOpen, setIsSimilarOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const activeStoreCode = useSelector(selectActiveStoreCode);
  const activeStoreId = useSelector(selectActiveStoreId);
  const storeCode = storeCodeOverride ?? activeStoreCode;

  const {
    item_id,
    item_code,
    item_name,
    has_stock,
    weight,
    net_weight,
    metal_id,
    karat_code,
    metal_color_code,
    metal_color_name,
    image,
    image_url,
    image_1,
    price,
    is_pricing: isPricing = false,
    style_id,
    item_size_name,
  } = product;

  const { externalProductId } = useStyleExternalProductId(style_id ?? null);
  const { average: ratingAverage, count: ratingCount } = useProductReviewSummary(externalProductId);
  const { items: similarItems, isLoading: similarLoading } = useSimilarProducts(
    showSimilarIcon ? product : null,
    activeStoreId,
    { enabled: showSimilarIcon && isSimilarOpen }
  );
  const canShowSimilarIcon = showSimilarIcon && !!item_id;

  const inStock      = realStock ? realStock.hasStock : has_stock === true;
  const badgeStoreCodes = realStock ? realStock.storeCodes : (storeCode ? [storeCode] : []);
  const metalLabel   = getMetalLabel(metal_id);
  const weightLabel  = formatWeight(net_weight ?? weight ?? null);
  const karatLabel   = karat_code && karat_code !== 'NA' ? karat_code : null;
  const metalColorName = resolveMetalColorName({ metal_color_code, metal_color_name });
  const metalKaratLabel = metalLabel === 'Gold' && karatLabel
    ? `${karatLabel} Karat ${metalColorName ?? 'Gold'}`
    : [metalLabel, karatLabel].filter(Boolean).join(' ') || null;

  const sizeLabel = item_size_name && item_size_name !== 'NA' ? `Size ${item_size_name}` : null;

  const infoLine = [metalKaratLabel, weightLabel, sizeLabel].filter(Boolean).join(' · ') || null;

  const rawSrc  = image ?? image_url ?? image_1 ?? null;
  const imageSrc = !imgError ? resolveImageSrc(rawSrc) : null;
  const cardPricedItem = price != null ? { sub_total: price, net_amount: price } : null;

  function handleTap() {
    if (!item_id) return;
    if (similarProductsSurface) {
      tracker.track(EVENTS.SIMILAR_PRODUCT_CLICKED, {
        surface: similarProductsSurface,
        ...buildProductAttributes({ product, pricedItem: cardPricedItem }),
      });
    }
    router.push(`/products/${item_id}`);
  }
  
  return (
    <>
    <motion.div
      role="button"
      tabIndex={0}
      onClick={handleTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTap();
        }
      }}
      className={[
        'group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left',
        'shadow-sm transition-all duration-standard ease-premium',
        'hover:shadow-md hover:border-accent/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        !inStock && 'opacity-60',
      ].filter(Boolean).join(' ')}
      aria-label={`View ${item_name ?? item_code ?? 'product'}`}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      transition={{ duration: DURATION.micro, ease: EASE_PREMIUM }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={item_name ?? 'Product image'}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            {...(priorityImage
              ? { priority: true, fetchPriority: 'high' }
              : { loading: 'lazy', fetchPriority: 'low' })}
          />
        ) : (
          <NoImagePlaceholder />
        )}

        {showStockBadge && (
          <div className="absolute left-0 top-3">
            <StockBadge inStock={inStock} storeCodes={badgeStoreCodes} />
          </div>
        )}

        <WishlistButton product={product} reduceMotion={reduceMotion} />
        
        {ratingCount > 0 && (
          <div className="absolute bottom-2 left-2 z-10 rounded-full bg-card/90 px-2 py-1 shadow-sm backdrop-blur-sm">
            <StarRating rating={ratingAverage} count={ratingCount} compact />
          </div>
        )}
        {canShowSimilarIcon && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              tracker.track(EVENTS.SIMILAR_PRODUCTS_VIEWED, {
                surface: 'sheet',
                item_count: similarItems.length,
                ...buildProductAttributes({ product, pricedItem: cardPricedItem }),
              });
              setIsSimilarOpen(true);
            }}
            aria-label="View similar products"
            title="View similar products"
            className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card"
          >
            <PlayingCardsFan size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 border-t border-border p-2.5 sm:p-3.5">
        
        <span className="min-h-4 text-xs sm:block hidden text-muted-foreground">
          {infoLine ?? ' '}
        </span>
        
        {price != null ? (
          <p className="flex flex-wrap items-baseline gap-x-1 font-sans text-sm font-bold text-foreground sm:text-base md:text-lg">
            {formatINR(price)}
            <span className="text-[9px] font-medium text-muted-foreground sm:text-[10px] md:text-xs">
              (excl. GST)
            </span>
          </p>
        ) : (
          <p className="font-sans text-xs font-medium text-muted-foreground sm:text-sm">
            {isPricing ? 'Pricing…' : 'Price unavailable'}
          </p>
        )}
        <p className="line-clamp-3 min-h-10 text-xs sm:text-sm font-semibold leading-snug text-foreground">
          {item_name && item_name !== item_code ? item_name : ''}
        </p>

        {item_code && (
          <span className="text-[10px] text-muted-foreground sm:text-[11px] md:text-xs">{item_code}</span>
        )}

      </div>
    </motion.div>

    {canShowSimilarIcon && (
      <SimilarProductsSheet
        isOpen={isSimilarOpen}
        onClose={() => setIsSimilarOpen(false)}
        items={similarItems}
        isLoading={similarLoading}
      />
    )}
    </>
  );
}
export default memo(ProductCard);
