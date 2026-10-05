'use client';

import { useState, useEffect } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { PackageSearch } from 'lucide-react';
import ProductCard     from '@/components/features/catalog/ProductCard';
import CatalogSkeleton from '@/components/features/catalog/CatalogSkeleton';
import EmptyState      from '@/components/shared/EmptyState';
import { Button }      from '@/components/ui/button';

const GRID_CLASSNAME = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
const OVERSCAN_PX = 400;
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
  const [scrollParent, setScrollParent] = useState(null);
  useEffect(() => {
    const el = typeof document !== 'undefined' ? document.getElementById('main-content') : null;
    const raf = requestAnimationFrame(() => setScrollParent(el));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (isLoading || !scrollParent) return <CatalogSkeleton />;

  if (!products.length) {
    return (
      <CatalogEmptyState
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
      />
    );
  }

  return (
    <>
      <VirtuosoGrid
        customScrollParent={scrollParent}
        totalCount={products.length}
        overscan={OVERSCAN_PX}
        listClassName={GRID_CLASSNAME}
        rangeChanged={onRangeChanged}
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
      />
      {isFetchingMore && <FetchingSpinner />}
      {!hasMore && products.length > 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          All {products.length} products loaded
        </p>
      )}
    </>
  );
}