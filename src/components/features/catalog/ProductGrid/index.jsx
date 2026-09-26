'use client';

// Renders the product grid, virtualized (react-virtuoso's VirtuosoGrid) with
// automatic infinite scroll via its own endReached callback.
//
// Virtualization added 2026-09-18: this grid was previously a plain
// products.map() rendering every loaded item's real DOM + hooks at once. At
// 100 items/page (APP_CONFIG.PAGINATION.CATALOG_TAKE), that meant ~100
// mounted ProductCards simultaneously firing their own per-card network
// calls (style→Shopify-id lookup, then a Nector rating lookup) — see
// useStyleExternalProductId/useProductReviewSummary's own comments for the
// resulting multi-minute delay this caused. Those calls are now
// concurrency-queued regardless, but virtualizing on top means only the
// cards actually near the viewport ever mount at all, however far someone
// has scrolled — the two fixes compound rather than compete.
//
// VirtuosoGrid (not a plain react-window FixedSizeGrid) specifically because
// it works with an ordinary responsive CSS grid (listClassName below is the
// same Tailwind grid-cols-* classes the old plain div used) instead of
// requiring hardcoded pixel column widths/counts per breakpoint.
//
// customScrollParent, NOT useWindowScroll: the actual scroll container on
// every page in this app (catalog included — see that page's own "#main-
// content is the sole scroll container" comment) is AppShell's <main
// id="main-content" class="overflow-y-auto">, not the browser window itself
// (the window never scrolls; the sidebar+header shell is fixed-height). See
// ScrollToTopButton for the same #main-content lookup pattern used elsewhere.

import { useState } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { PackageSearch } from 'lucide-react';
import ProductCard     from '@/components/features/catalog/ProductCard';
import CatalogSkeleton from '@/components/features/catalog/CatalogSkeleton';
import EmptyState      from '@/components/shared/EmptyState';
import { Button }      from '@/components/ui/button';

const GRID_CLASSNAME = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
// Pixels of extra rows kept mounted beyond the viewport in each direction —
// enough to make fast scrolling feel seamless (no blank flash) without
// re-inflating the mounted-card count back toward "the whole page".
const OVERSCAN_PX = 400;
// First row's worth of cards (widest breakpoint is xl:grid-cols-5, plus one
// spare) get priority image loading — see ProductCard's own `priorityImage`
// doc comment. Deliberately a flat count, not breakpoint-aware: overshooting
// by a card or two on a narrower screen costs one extra eager fetch, not a
// correctness bug — undershooting would just silently miss the real LCP
// element on wider screens.
const FIRST_ROW_PRIORITY_COUNT = 6;

// Delegates to the shared EmptyState (same card/badge/icon convention used elsewhere).
function CatalogEmptyState({ hasFilters, onClearFilters }) {
  return (
    <EmptyState
      className="py-20"
      icon={PackageSearch}
      title={hasFilters ? 'No products match your filters' : 'No products found'}
      description={
        hasFilters
          ? 'Try adjusting or clearing your filters.'
          : 'This store has no products in the catalog yet.'
      }
      action={
        hasFilters && (
          <Button type="button" onClick={onClearFilters}>
            Clear filters
          </Button>
        )
      }
    />
  );
}

function FetchingSpinner() {
  return (
    <div className="flex justify-center py-6" aria-label="Loading more products">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <svg
          className="h-4 w-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading more…
      </div>
    </div>
  );
}

/**
 * @param {{
 *   products:        object[],
 *   isLoading:       boolean,
 *   isFetchingMore:  boolean,
 *   hasMore:         boolean,
 *   hasFilters:      boolean,
 *   showStockBadge:  boolean,
 *   storeCode:       string|null,
 *   onLoadMore:      () => void,
 *   onClearFilters:  () => void,
 *   prioritizeFirstRow?: boolean,
 *   onRangeChanged?: (range: { startIndex: number, endIndex: number }) => void,
 * }} props
 *   storeCode - overrides ProductCard's default "In Stock" store code
 *   (activeStoreCode) with the store this grid is actually showing, since
 *   that isn't always the signed-in store (see OtherStoreSection).
 *   prioritizeFirstRow (default true) - false for OtherStoreSection, whose
 *   grid only ever renders BELOW the primary one once it's scrolled into
 *   view — its own "first row" is never actually above the fold, so it
 *   should never claim the eager/high-fetch-priority treatment that's
 *   meant for whatever the operator sees the instant the page paints.
 */
export default function ProductGrid({
  products       = [],
  isLoading,
  isFetchingMore,
  hasMore,
  hasFilters,
  showStockBadge = false,
  storeCode,
  onLoadMore,
  onClearFilters,
  prioritizeFirstRow = true,
  onRangeChanged,
}) {
  // Lazy-initialized, not an effect: by the time this component's function
  // body runs on the client (fresh mount or hydration), the browser has
  // already parsed AppShell's <main id="main-content"> into the DOM — it's
  // an ancestor node, not something this component or an effect needs to
  // wait on. `document` is guarded only for the server render pass, where
  // it's `undefined`; the value is unused there anyway (no scrolling happens
  // server-side).
  const [scrollParent] = useState(() =>
    (typeof document !== 'undefined' ? document.getElementById('main-content') : null));

  if (isLoading) return <CatalogSkeleton />;

  if (!products.length) {
    return (
      <CatalogEmptyState
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
      />
    );
  }

  return (
    <VirtuosoGrid
      customScrollParent={scrollParent ?? undefined}
      totalCount={products.length}
      overscan={OVERSCAN_PX}
      listClassName={GRID_CLASSNAME}
      rangeChanged={onRangeChanged}
      // FIXED 2026-09-23 (reported: "View Similar shows the previous
      // product's results no matter which card you open it from") — this
      // had no computeItemKey at all, so Virtuoso's own item recycling kept
      // whichever DOM/component instance a given grid slot already had and
      // just handed it new props, INCLUDING every ProductCard's own local
      // hook state (isSimilarOpen, and useSimilarProducts' memoized match
      // list riding along with it) — a slot that had shown one product's
      // "similar" sheet open could get recycled into a completely different
      // product without React ever treating it as a fresh mount. Keying by
      // the real item_id forces a genuine remount whenever a slot's product
      // identity actually changes, instead of silently reusing stale state.
      computeItemKey={(index) => products[index]?.item_id ?? index}
      endReached={() => {
        if (hasMore && !isFetchingMore) onLoadMore();
      }}
      itemContent={(index) => {
        const product = products[index];
        return (
          <ProductCard
            product={product}
            showStockBadge={showStockBadge}
            storeCode={storeCode}
            priorityImage={prioritizeFirstRow && index < FIRST_ROW_PRIORITY_COUNT}
          />
        );
      }}
      components={{
        Footer: () => (
          <>
            {isFetchingMore && <FetchingSpinner />}
            {!hasMore && products.length > 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                All {products.length} products loaded
              </p>
            )}
          </>
        ),
      }}
    />
  );
}