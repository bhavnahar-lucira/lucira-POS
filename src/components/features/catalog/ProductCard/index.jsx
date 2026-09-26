'use client';

// Catalog product card: image, price, and stock/rating badges.
// `price` is filled in out-of-band by useLiveCatalogPrices (the same
// calculator checkout bills from) and is null until resolved, or
// permanently for an item that can't be priced — render no price rather
// than a wrong one. metal_color_code/metal_color_name: different upstream
// endpoints spell this differently; see lib/metalColor.js.
// Star rating only renders for products with a style_id (needed to
// resolve Nector's external_product_id) — most catalog rows lack one, so
// most cards simply show no rating badge.

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

// On-brand placeholder instead of a generic "broken image" glyph — most
// catalog rows genuinely have no photo asset yet, so this isn't an error state.
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

// Flag/tag shape flush to the card's left edge, not a floating pill.
// storeCodes lists every store (plural — a card can be in stock at
// several) the badge should credit; shown only alongside "In Stock",
// never "Made to Order".
//
// Only the FIRST store code is named, with a "+N" for the rest (e.g.
// "BO1 │ +3" for four in-stock stores) rather than listing every code —
// this badge sits on a small image corner, and "PN1, BO1, CS1, N18" doesn't
// fit there the way a single code + count does, and only gets worse as more
// stores open. Card-local only, by design: CrossStoreStockPanel (the
// product detail page's own "Stock Across Stores" list) still names every
// store in full — that's the place an operator actually needs the complete
// list, this badge is just a glance.
//
// The "+N" gets its own small pill rather than sitting as plain text right
// after the code — run together ("BO1+3") they read as one garbled token;
// a vertical divider plus a distinct chip makes it unambiguous at a glance
// that N is a COUNT, not part of the store code itself.
function StockBadge({ inStock, storeCodes }) {
  const [firstCode, ...restCodes] = storeCodes ?? [];
  return (
    <Badge
      className={[
        // Smaller/tighter below sm only — at a 2-up mobile card width, the
        // full-size badge's text stretched far enough right to run under
        // WishlistButton's top-right heart (reported directly). Desktop/tab
        // (sm+) is untouched.
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
 *   priorityImage (default false) - set by ProductGrid for roughly the
 *   first on-screen row only (see that component's FIRST_ROW_PRIORITY_COUNT).
 *   That row is the likely LCP element on /catalog, so it skips lazy-loading
 *   and gets a high fetch-priority hint instead of competing on equal
 *   footing with the rest of a 100-item page. Every other card explicitly
 *   marks itself low-priority + lazy — deliberate for a card whose image
 *   isn't the page's main content, even before it scrolls into view.
 *   realStock - genuine cross-store stock for this exact item_id, from
 *   useCrossStoreStockCodes. Pass it wherever product.has_stock can't be
 *   trusted as a live, correctly-scoped verdict (Recently Viewed, Wishlist);
 *   overrides both has_stock and storeCode when present. Omitted on the
 *   main catalog grid/OtherStoreSection, where has_stock is already
 *   correctly scoped server-side.
 *   showSimilarIcon (default true) - every card gets the "View Similar"
 *   icon EXCEPT the ones rendered inside SimilarProductsSheet's own grid
 *   (which explicitly passes `false`) — a "view similar of this similar
 *   item" nested sheet-on-a-sheet is confusing on its own, independent of
 *   anything technical. (An earlier version of this prop also disabled the
 *   icon inside Swiper carousels, working around the sheet's
 *   `position: fixed` breaking under Swiper's own `.swiper-wrapper`
 *   transform — BottomSheet now portals to document.body instead, which
 *   fixes that directly, so every carousel keeps the icon like any other
 *   card.)
 *   similarProductsSurface (default null) - set ONLY by SimilarProductsSheet
 *   and SimilarProductsCarousel, identifying which "similar products" UI
 *   this card lives inside. When set, tapping the card to navigate fires
 *   EVENTS.SIMILAR_PRODUCT_CLICKED (see handleTap below) — every other
 *   caller (catalog grid, Recently Viewed, Wishlist) leaves this null, so
 *   an ordinary product view/tap is never mistaken for a similar-products
 *   interaction.
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
  // storeCodeOverride lets a card (e.g. in OtherStoreSection) show a
  // different store's code than the operator's active store; ignored once
  // realStock is passed, since that's already the real answer.
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
    // Set by the catalog page: the live price hasn't come back yet, as
    // opposed to having come back with no sellable price.
    is_pricing: isPricing = false,
    style_id,
    // Only populated for a wishlisted item with a confirmed Customize
    // selection; a plain catalog/recently-viewed row has no size concept.
    item_size_name,
  } = product;

  const { externalProductId } = useStyleExternalProductId(style_id ?? null);
  const { average: ratingAverage, count: ratingCount } = useProductReviewSummary(externalProductId);

  // enabled: isSimilarOpen — FIXED 2026-09-18 (reported: "View Similar icon
  // takes minutes to appear"). This used to run with enabled:false on every
  // mounted card just to read whether the shared tenant-wide catalog sweep
  // (useAllCatalog, ~2,699 items) had ALREADY resolved, so it could decide
  // whether to show the icon at all — meaning the icon genuinely could not
  // exist until that sweep finished, elsewhere in the app. Now the icon
  // always shows immediately (SimilarProductsSheet's own empty state
  // handles a genuine no-match case), and the match computation — which
  // needs that sweep's data — only runs once the operator actually opens
  // the sheet, not ahead of time on the chance they might. product is null
  // when showSimilarIcon is false — no reason to even run the match/sort
  // when the icon (and the sheet it would open) can never show here at all.
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
  // Purity/karat when the API gives us a real one — "NA" (mostly synthetic
  // stone rows) is dropped rather than shown as a literal "NA".
  const karatLabel   = karat_code && karat_code !== 'NA' ? karat_code : null;
  const metalColorName = resolveMetalColorName({ metal_color_code, metal_color_name });

  // Gold gets "{karat} Karat {Color} Gold" (falls back to "{karat} Karat
  // Gold" if color doesn't resolve); other metals keep "{Metal} {code}"
  // (e.g. "Silver 925") since "Karat" isn't the right unit for those.
  const metalKaratLabel = metalLabel === 'Gold' && karatLabel
    ? `${karatLabel} Karat ${metalColorName ?? 'Gold'}`
    : [metalLabel, karatLabel].filter(Boolean).join(' ') || null;

  const sizeLabel = item_size_name && item_size_name !== 'NA' ? `Size ${item_size_name}` : null;

  const infoLine = [metalKaratLabel, weightLabel, sizeLabel].filter(Boolean).join(' · ') || null;

  const rawSrc  = image ?? image_url ?? image_1 ?? null;
  const imageSrc = !imgError ? resolveImageSrc(rawSrc) : null;

  function handleTap() {
    if (!item_id) return;
    if (similarProductsSurface) {
      tracker.track(EVENTS.SIMILAR_PRODUCT_CLICKED, {
        surface: similarProductsSurface,
        ...buildProductAttributes({ product }),
      });
    }
    router.push(`/products/${item_id}`);
  }

  // role="button" on a <div>, not a real <button> — WishlistButton below
  // renders its own real <button>, and a <button> cannot contain another
  // <button> (the outer one used to be real; the browser auto-closes it on
  // the nested button, silently breaking the card's click target).
  // tabIndex + onKeyDown reproduce Enter/Space behavior a div lacks.
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
        // h-full/w-full: a no-op on the catalog grid, but load-bearing
        // inside RecentlyViewedCarousel's Swiper — an ordinary block child
        // doesn't inherit a flex slide's stretch on its own, so without
        // this, cards with wrapping vs. non-wrapping names got uneven heights.
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

        {/* Rating badge floats bottom-LEFT over the image (moved from
            bottom-right to make room for "View Similar" on the right —
            see below). `compact` forces the single-star + value + count
            form — a small corner badge has no room for 5 full stars. */}
        {ratingCount > 0 && (
          <div className="absolute bottom-2 left-2 z-10 rounded-full bg-card/90 px-2 py-1 shadow-sm backdrop-blur-sm">
            <StarRating rating={ratingAverage} count={ratingCount} compact />
          </div>
        )}

        {/* "View Similar" — bottom-right (top-left is StockBadge, top-right
            WishlistButton, bottom-left the rating badge). stopPropagation:
            this button sits inside the card's own role="button" click
            target (navigate to the product), same reason WishlistButton's
            own button needs it. Always shown now (see canShowSimilarIcon's
            own comment above) — the rare item with no real match just opens
            to SimilarProductsSheet's empty state instead of not having an
            icon at all; item_count in the tracked event below is whatever
            similarItems currently holds, which is 0 until the sheet's own
            fetch resolves. */}
        {canShowSimilarIcon && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              tracker.track(EVENTS.SIMILAR_PRODUCTS_VIEWED, {
                surface: 'sheet',
                item_count: similarItems.length,
                ...buildProductAttributes({ product }),
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

        {/* Always rendered (min-h reserves its line even when infoLine is
            null) — a card whose metal/weight data happens to be missing
            must not sit shorter, or shift its price/name up, relative to
            every other card in the same Swiper row/carousel. That was the
            real cause of cards reading as "uneven size" even though the
            outer card itself is already h-full/w-full stretched: two equal-
            height cards can still look mismatched if their PRICE and NAME
            land at different vertical positions inside them. */}
        <span className="min-h-4 text-xs sm:block hidden text-muted-foreground">
          {infoLine ?? ' '}
        </span>

        {/* Price is live-priced and arrives after the card mounts — show
            "Pricing…"/"Price unavailable" instead of a blank gap. Staying
            unpriced is a real, sellable-at-0 state, not a glitch. */}
        {price != null ? (
          <p className="font-sans text-sm font-bold text-foreground sm:text-base md:text-lg">
            {formatINR(price)}
          </p>
        ) : (
          <p className="font-sans text-xs font-medium text-muted-foreground sm:text-sm">
            {isPricing ? 'Pricing…' : 'Price unavailable'}
          </p>
        )}

        {/* min-h-10 ≈ two lines at this text size — reserved even when a
            row has no real item_name (item_name === item_code, a raw
            unnamed catalog record), for the same reason as infoLine above. */}
        <p className="line-clamp-3 min-h-10 text-xs sm:text-sm font-semibold leading-snug text-foreground">
          {item_name && item_name !== item_code ? item_name : ''}
        </p>

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

// Memoized: the catalog grid can hold 150+ mounted cards while live pricing
// streams in, and only the few cards with a new price should re-render.
// Requires catalog/page.jsx to keep `product`'s object reference stable
// across renders when nothing changed, or this shallow-compare memo re-renders anyway.
export default memo(ProductCard);
