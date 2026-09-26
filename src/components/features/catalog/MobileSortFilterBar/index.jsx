'use client';

// Floating "Sort | Filter" pill for narrow screens — the desktop sticky
// filter bar (catalog/page.jsx) is `hidden` below `lg` because it took up
// roughly half the mobile viewport on its own (reported directly). Below
// `lg`, this pill is the only way to reach search/store/category/OOS/sort,
// all consolidated into the Filter sheet per the reference screenshots
// (Lucira Jewelry's own Shopify storefront) — sort stays separate, since
// that's how the reference splits it too.
//
// Both sheets reuse the exact same controls/state as the desktop bar
// (CatalogSortDropdown's underlying SORT_OPTIONS, CategoryFilter,
// ProductSearchBar, CatalogStoreSelector, OutOfStockToggle) — every change
// commits immediately via useCatalogFilters' URL params, same as desktop,
// so "Apply Filters" only needs to close the sheet, not stage anything.

import { useState } from 'react';
import { ArrowUpDown, Check, SlidersHorizontal } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import CategoryFilter from '@/components/features/catalog/CategoryFilter';
import CatalogStoreSelector from '@/components/features/catalog/CatalogStoreSelector';
import OutOfStockToggle from '@/components/features/catalog/OutOfStockToggle';
import ProductSearchBar from '@/components/features/catalog/ProductSearchBar';
import { Button } from '@/components/ui/button';
import { SORT_OPTIONS, DEFAULT_SORT } from '@/hooks/catalog/useCatalogFilters';

export default function MobileSortFilterBar({
  sortBy,
  onSortChange,
  searchQuery,
  onSearch,
  onBarcodeDetected,
  catalogStoreId,
  onStoreChange,
  showOutOfStock,
  onShowOutOfStockChange,
  categories,
  activeCategorySlug,
  hasActiveFilters,
  onSelectCategory,
  onClearFilters,
}) {
  const [openSheet, setOpenSheet] = useState(null); // null | 'sort' | 'filter'

  return (
    <>
      <div className="lg:hidden fixed inset-x-0 bottom-4 z-30 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-stretch overflow-hidden rounded-full bg-primary text-background shadow-xl">
          <button
            type="button"
            onClick={() => setOpenSheet('sort')}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium active:bg-white/10"
          >
            <ArrowUpDown size={16} /> Sort
          </button>
          <div className="w-px my-2 bg-background/25" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setOpenSheet('filter')}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium active:bg-white/10"
          >
            <SlidersHorizontal size={16} /> Filter
            {hasActiveFilters && (
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <BottomSheet
        isOpen={openSheet === 'sort'}
        onClose={() => setOpenSheet(null)}
        title="Sort by"
        alwaysBottom
      >
        <div className="flex flex-col gap-1">
          {SORT_OPTIONS.map((opt) => {
            const isActive = (sortBy || DEFAULT_SORT) === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onSortChange(opt.value); setOpenSheet(null); }}
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-secondary'
                }`}
              >
                {opt.label}
                {isActive && <Check size={16} />}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={openSheet === 'filter'}
        onClose={() => setOpenSheet(null)}
        title="Filters"
        alwaysBottom
        footerClassName="p-0"
        footer={
          <div className="flex">
            <Button
              type="button"
              variant="outline"
              className="flex-1 min-h-14 rounded-none border-0"
              onClick={onClearFilters}
            >
              Clear All
            </Button>
            <Button
              type="button"
              className="flex-1 min-h-14 rounded-none"
              onClick={() => setOpenSheet(null)}
            >
              Apply Filters
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <ProductSearchBar
            value={searchQuery ?? ''}
            onSearch={onSearch}
            onBarcodeDetected={onBarcodeDetected}
          />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Store</span>
            <CatalogStoreSelector catalogStoreId={catalogStoreId} onStoreChange={onStoreChange} />
          </div>

          <OutOfStockToggle showOutOfStock={showOutOfStock} onToggle={onShowOutOfStockChange} />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</span>
            <CategoryFilter
              categories={categories}
              activeCategorySlug={activeCategorySlug}
              hasActiveFilters={hasActiveFilters}
              onSelectCategory={onSelectCategory}
              onClearFilters={onClearFilters}
              wrap
            />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
