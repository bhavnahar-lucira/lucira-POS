'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter }   from 'next/navigation';
import { useSelector } from 'react-redux';
import { toast }       from 'sonner';

import { useCatalogFilters }     from '@/hooks/catalog/useCatalogFilters';
import { useCatalogProducts }    from '@/hooks/catalog/useCatalogProducts';
import { useAllCatalog }         from '@/hooks/catalog/useAllCatalog';
import { useSkuSearch }          from '@/hooks/catalog/useSkuSearch';
import { useExactSkuSearch }     from '@/hooks/catalog/useExactSkuSearch';
import { useCategoryNameSearch } from '@/hooks/catalog/useCategoryNameSearch';
import { useCategories }         from '@/hooks/catalog/useCategoryFilters';
import { useSubTypeOptions, useAttributeOptions, useItemSizeOptions } from '@/hooks/catalog/useCatalogFilterOptions';
import { useLiveCatalogPrices }  from '@/hooks/catalog/useLiveCatalogPrices';
import { useCrossStoreStockCodes } from '@/hooks/catalog/useCrossStoreStockCodes';
import { useBarcodeLookup } from '@/hooks/catalog/useBarcodeLookup';

import ProductGrid           from '@/components/features/catalog/ProductGrid';
import ProductSearchBar      from '@/components/features/catalog/ProductSearchBar';
import CatalogSortDropdown   from '@/components/features/catalog/CatalogSortDropdown';
import CatalogStoreSelector  from '@/components/features/catalog/CatalogStoreSelector';
import CatalogSkeleton       from '@/components/features/catalog/CatalogSkeleton';
import OtherStoreSection     from '@/components/features/catalog/OtherStoreSection';
import MobileSortFilterBar   from '@/components/features/catalog/MobileSortFilterBar';
import ProductFilterPanel    from '@/components/features/catalog/ProductFilterPanel';
import BottomSheet           from '@/components/shared/BottomSheet';
import { Button }            from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';

import { stableSortProducts } from '@/lib/catalogSort';
import { applyPriceFilter, getPriceBounds } from '@/lib/catalogFacets';
import APP_CONFIG from '@/constants/appConfig';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import TOAST from '@/constants/toastMessages';
import { selectAvailableStores } from '@/store/slices/storeSlice';

const { SEARCH } = APP_CONFIG;
const STOCK_CHECK_WINDOW = 300;

const selectActiveStoreId = (s) => s.store.activeStoreId;

// ── Client-side helpers ───────────────────────────────────────────────────────

function isInStock(product) {
  return product.has_stock === true;
}

function getMatchingTypeIds(q, categories) {
  if (!q || !categories.length) return [];
  const lower = q.toLowerCase();
  return categories
    .filter((c) => c.type_name?.toLowerCase().includes(lower))
    .map((c) => c.type_id)
    .filter(Boolean);
}

function applySearchFilterOnly(allProducts, {
  searchQuery,
  activeCategoryId,
  showOutOfStock,
  categories,
}) {
  let result = allProducts;

  if (!showOutOfStock) {
    result = result.filter(isInStock);
  }

  if (activeCategoryId) {
    result = result.filter((p) => p.type_id === activeCategoryId);
  }

  const q = searchQuery?.trim().toLowerCase() ?? '';
  if (q.length >= SEARCH.MIN_QUERY_LENGTH) {
    const matchingTypeIds = getMatchingTypeIds(q, categories);

    result = result.filter((p) => {
      if (p.item_code?.toLowerCase().includes(q)) return true;
      if (p.item_name?.toLowerCase().includes(q)) return true;
      if (matchingTypeIds.length && matchingTypeIds.includes(p.type_id)) return true;
      return false;
    });
  }

  return result;
}

function applyBasicFilterOnly(products, { activeCategoryId, showOutOfStock }) {
  let result = products;
  if (!showOutOfStock) result = result.filter(isInStock);
  if (activeCategoryId) result = result.filter((p) => p.type_id === activeCategoryId);
  return result;
}

// ── CatalogScreen ─────────────────────────────────────────────────────────────

function CatalogScreen() {
  const router       = useRouter();
  const reduxStoreId = useSelector(selectActiveStoreId);

  const { filters, hasActiveFilters, actions } = useCatalogFilters();
  const {
    activeCategorySlug,
    searchQuery,
    sortBy,
    showOutOfStock,
    catalogStoreId,
    facets,
  } = filters;
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const effectiveStoreId = catalogStoreId ?? reduxStoreId;
  const isSearchMode     = !!searchQuery && searchQuery.length >= SEARCH.MIN_QUERY_LENGTH;
  const searchShowOutOfStock = isSearchMode || showOutOfStock;
  const availableStores = useSelector(selectAvailableStores);
  const otherStores = useMemo(
    () => availableStores.filter((s) => s.company_id !== effectiveStoreId),
    [availableStores, effectiveStoreId]
  );
  
  const effectiveStoreCode = useMemo(
    () => availableStores.find((s) => s.company_id === effectiveStoreId)?.company_code ?? null,
    [availableStores, effectiveStoreId]
  );

  // ── Categories ────────────────────────────────────────────────────────────
  const { data: categories = [], isError: catsError } = useCategories();

  // ── Resolve slug → type_id ────────────────────────────────────────────────
  const activeCategoryId = useMemo(() => {
    if (!activeCategorySlug || !categories.length) return null;
    const slug = activeCategorySlug.replace(/-/g, ' ').toLowerCase();
    return (
      categories.find((c) => c.type_name?.toLowerCase() === slug)?.type_id ??
      categories.find((c) => c.type_name?.toLowerCase().startsWith(slug + ' '))?.type_id ??
      categories.find((c) => c.type_name?.toLowerCase().startsWith(slug))?.type_id ??
      null
    );
  }, [activeCategorySlug, categories]);

  // ── Browse mode ───────────────────────────────────────────────────────────
  const {
    data,
    isLoading:         browseLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError:           browseError,
  } = useCatalogProducts({
    storeId:           effectiveStoreId,
    show_out_of_stock: showOutOfStock,
    ...(activeCategoryId && { type_ids: [activeCategoryId] }),
    ...(activeCategoryId && facets.subTypeIds.length && { sub_type_ids: facets.subTypeIds }),
    karat_ids:           facets.karatIds,
    metal_ids:           facets.metalColorIds,
    shape_ids:           facets.shapeIds,
    item_size_ids:       facets.itemSizeIds,
    collection_ids:      facets.collectionIds,
    from_weight:         facets.weightFrom,
    to_weight:           facets.weightTo,
    from_diamond_weight: facets.diamondWeightFrom,
    to_diamond_weight:   facets.diamondWeightTo,
  });
  
  const rawBrowseProducts = data?.products ?? [];

  // ── Search / facet mode ───────────────────────────────────────────────────
  const needsFullSweep = isSearchMode;
  const [hasSearched, setHasSearched]                 = useState(needsFullSweep);
  const [prevNeedsFullSweep, setPrevNeedsFullSweep]   = useState(needsFullSweep);
  if (needsFullSweep !== prevNeedsFullSweep) {
    setPrevNeedsFullSweep(needsFullSweep);
    if (needsFullSweep) setHasSearched(true);
  }

  const {
    data:        allProducts = [],
    isLoading:   allLoading,
    isSuccess:   allReady,
    isError:     allError,
    loadedCount, 
  } = useAllCatalog(effectiveStoreId, { enabled: hasSearched, showOutOfStock });
  
  const {
    data: skuResults = [],
  } = useSkuSearch(isSearchMode ? searchQuery : '', effectiveStoreId);
  
  const {
    data: exactSkuResults = [],
  } = useExactSkuSearch(isSearchMode ? searchQuery : '', effectiveStoreId);
  
  const matchingTypeIds = useMemo(
    () => (isSearchMode ? getMatchingTypeIds(searchQuery, categories) : []),
    [isSearchMode, searchQuery, categories],
  );
  const {
    data: categoryNameResults = [],
  } = useCategoryNameSearch(matchingTypeIds, effectiveStoreId, isSearchMode);

  // UNSORTED — same reason as rawBrowseProducts above.
  const searchResults = useMemo(() => {
    if (!needsFullSweep) return [];

    const categoryNameMatches = applyBasicFilterOnly(categoryNameResults, { activeCategoryId, showOutOfStock: searchShowOutOfStock });
    const skuMatches = applyBasicFilterOnly(skuResults, { activeCategoryId, showOutOfStock: searchShowOutOfStock });
    const exactSkuMatches = exactSkuResults;

    if (allReady) {
      const swept = applySearchFilterOnly(allProducts, {
        searchQuery,
        activeCategoryId,
        showOutOfStock,
        categories,           // ← passed so category name matching works
      });
      
      const seen = new Set(swept.map((p) => p.item_id));
      const extra = [...categoryNameMatches, ...skuMatches, ...exactSkuMatches].filter((p) => {
        if (seen.has(p.item_id)) return false;
        seen.add(p.item_id);
        return true;
      });
      return [...swept, ...extra];
    }
    
    const seen = new Set();
    return [...skuMatches, ...categoryNameMatches, ...exactSkuMatches].filter((p) => {
      if (seen.has(p.item_id)) return false;
      seen.add(p.item_id);
      return true;
    });
  }, [
    needsFullSweep, allReady, allProducts, skuResults, exactSkuResults, categoryNameResults,
    searchQuery, activeCategoryId, showOutOfStock, searchShowOutOfStock, categories,
  ]);

  // ── Error toasts ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (browseError) toast.error(TOAST.CATALOG.LOAD_FAILED);
    if (allError)    toast.error(TOAST.CATALOG.SEARCH_ERROR);
    if (catsError)   toast.error(TOAST.CATALOG.FILTER_ERROR);
  }, [browseError, allError, catsError]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const displayProducts = needsFullSweep ? searchResults : rawBrowseProducts;
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 23 });
  const priorityItemIds = useMemo(
    () => displayProducts.slice(visibleRange.startIndex, visibleRange.endIndex + 1).map((p) => p.item_id),
    [displayProducts, visibleRange]
  );
  const isLoading       = needsFullSweep ? (!allReady && searchResults.length === 0) : browseLoading;
  const isFetchingMore  = !needsFullSweep && isFetchingNextPage;
  const hasMore         = !needsFullSweep && !!hasNextPage;
  const showStockBadge  = true; // always show — badge content reflects actual stock status
  const { priceById: livePriceById, settledIds } = useLiveCatalogPrices(displayProducts, { priorityItemIds, storeIdOverride: effectiveStoreId });
  const stockCheckItemIds = useMemo(
    () => displayProducts.slice(0, STOCK_CHECK_WINDOW).map((p) => p.item_id).filter((id) => id != null),
    [displayProducts]
  );
  const { stockByItemId: liveStockByItemId } = useCrossStoreStockCodes(stockCheckItemIds);
  const [mergeCache, setMergeCache] = useState(() => new Map());
  const { mergedEntries, nextMergeCache } = useMemo(() => {
    const nextMergeCache = new Map();
    const mergedEntries = displayProducts.map((p) => {
      const price = p.price ?? livePriceById.get(p.item_id) ?? null;
      // Distinguishes "still coming" from "there will never be a number".
      const isPricing = price == null && !settledIds.has(p.item_id);
      const liveStock = liveStockByItemId.get(p.item_id);
      const has_stock = liveStock ? liveStock.storeCodes.includes(effectiveStoreCode) : p.has_stock;
      const cached = mergeCache.get(p.item_id);
      const entry = (cached && cached.price === price && cached.isPricing === isPricing && cached.has_stock === has_stock)
        ? cached
        : { raw: p, price, isPricing, has_stock, merged: { ...p, price, is_pricing: isPricing, has_stock } };

      nextMergeCache.set(p.item_id, entry);
      return entry;
    });
    return { mergedEntries, nextMergeCache };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayProducts, livePriceById, settledIds, liveStockByItemId, effectiveStoreCode]);
  const pricedDisplayProducts = useMemo(
    () => mergedEntries.map((entry) => entry.merged),
    [mergedEntries]
  );
  const visibleDisplayProducts = useMemo(() => {
    let result = showOutOfStock ? pricedDisplayProducts : pricedDisplayProducts.filter((p) => p.has_stock === true);
    if (facets.priceMin != null || facets.priceMax != null) {
      result = applyPriceFilter(result, { priceMin: facets.priceMin, priceMax: facets.priceMax });
    }
    return result;
  }, [pricedDisplayProducts, showOutOfStock, facets.priceMin, facets.priceMax]);
  const priceBounds = useMemo(() => getPriceBounds(pricedDisplayProducts), [pricedDisplayProducts]);
  let mergeCacheChanged = nextMergeCache.size !== mergeCache.size;
  if (!mergeCacheChanged) {
    for (const [id, entry] of nextMergeCache) {
      if (mergeCache.get(id) !== entry) { mergeCacheChanged = true; break; }
    }
  }
  if (mergeCacheChanged) setMergeCache(nextMergeCache);
  const sortResetKey = `${sortBy}|${activeCategoryId ?? ''}|${showOutOfStock}|${effectiveStoreId ?? ''}|${needsFullSweep}|${searchQuery}|${JSON.stringify(facets)}`;
  const pricedSignature = useMemo(
    () => visibleDisplayProducts.map((p) => `${p.item_id}:${p.price ?? ''}:${p.has_stock}`).join('|'),
    [visibleDisplayProducts]
  );

  const [stableSort, setStableSort] = useState({ key: sortResetKey, signature: null, order: [] });

  let sortedDisplayProducts = stableSort.order;
  if (stableSort.signature !== pricedSignature || stableSort.key !== sortResetKey) {
    const baseOrder = stableSort.key !== sortResetKey ? [] : stableSort.order;
    sortedDisplayProducts = stableSortProducts(baseOrder, visibleDisplayProducts, sortBy);
    setStableSort({ key: sortResetKey, signature: pricedSignature, order: sortedDisplayProducts });
  }

  // ── Barcode handler ───────────────────────────────────────────────────────
  // useBarcodeLookup for the actual lookup+redirect logic.
  const { handleBarcodeDetected } = useBarcodeLookup({ storeId: effectiveStoreId });

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const handleSearch = useCallback((q) => {
    actions.setSearch(q);
    if (q.trim().length >= SEARCH.MIN_QUERY_LENGTH) {
      tracker.track(EVENTS.PRODUCT_SEARCHED, { query: q.trim() });
    }
  }, [actions]);

  const handleClearFilters = useCallback(() => actions.clearFilters(), [actions]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const countLabel = useMemo(() => {
    if (isLoading) {
      return needsFullSweep && loadedCount > 0 ? `Scanning catalog… ${loadedCount} checked so far` : null;
    }
    const n = displayProducts.length;
    if (isSearchMode) return `${n} result${n !== 1 ? 's' : ''} for "${searchQuery}"`;
    return `${n} product${n !== 1 ? 's' : ''}${hasActiveFilters ? ' matching filters' : ''}`;
  }, [isLoading, needsFullSweep, loadedCount, displayProducts.length, isSearchMode, searchQuery, hasActiveFilters]);

  // ── Filter panel option lists ─────────────────────────────────────────────
  const { options: subCategoryOptions, isLoading: subCategoryLoading } = useSubTypeOptions(activeCategoryId);
  const { options: karatOptions }       = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.KARAT);
  const { options: metalColorOptions }  = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.METAL_COLOR);
  const { options: diamondShapeOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.DIAMOND_SHAPE);
  const { options: collectionOptions }  = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.COLLECTION);
  const { options: itemSizeOptions }    = useItemSizeOptions();
  const handleFacetsChange = useCallback((patch) => {
    actions.setFacets(patch);
  }, [actions]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-background">
      <div className="hidden md:block sticky top-0 z-20 px-4 pt-4 pb-3 md:px-6 md:pt-5 bg-muted border-b border-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="w-full min-w-0 lg:flex-1">
            <ProductSearchBar
              value={searchQuery ?? ''}
              onSearch={handleSearch}
              onBarcodeDetected={handleBarcodeDetected}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-stretch lg:shrink-0">
            <CatalogStoreSelector
              catalogStoreId={catalogStoreId}
              onStoreChange={actions.setCatalogStore}
            />
            <CatalogSortDropdown
              sortBy={sortBy}
              onSortChange={actions.setSortBy}
            />
            <Button
              type="button"
              variant="outline"
              className="col-span-2 sm:col-auto h-11! w-full gap-2 rounded-lg flex-1 border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted sm:w-auto sm:shrink-0"
              onClick={() => setIsFilterPanelOpen(true)}
            >
              <SlidersHorizontal size={16} />
              Filters
              {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </div>

      <MobileSortFilterBar
        sortBy={sortBy}
        onSortChange={actions.setSortBy}
        hasActiveFilters={hasActiveFilters}
        onOpenFilters={() => setIsFilterPanelOpen(true)}
      />

      <BottomSheet
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        title="Filters"
        footerClassName="p-0"
        footer={
          <div className="flex items-stretch">
            <Button
              type="button"
              variant="outline"
              className="md:hidden min-h-14 flex-1 rounded-none"
              onClick={handleClearFilters}
            >
              Clear All
            </Button>
            <Button type="button" className="min-h-14 flex-1 rounded-none" onClick={() => setIsFilterPanelOpen(false)}>
              Apply Filters
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="md:hidden flex flex-col gap-3">
            <ProductSearchBar
              value={searchQuery ?? ''}
              onSearch={handleSearch}
              onBarcodeDetected={handleBarcodeDetected}
            />
            <CatalogStoreSelector catalogStoreId={catalogStoreId} onStoreChange={actions.setCatalogStore} />
            <div className="border-t border-border" />
          </div>

          <ProductFilterPanel
            categories={categories}
            activeCategorySlug={activeCategorySlug}
            onSelectCategory={actions.selectCategory}
            subCategoryOptions={subCategoryOptions}
            subCategoryLoading={subCategoryLoading}
            karatOptions={karatOptions}
            metalColorOptions={metalColorOptions}
            diamondShapeOptions={diamondShapeOptions}
            itemSizeOptions={itemSizeOptions}
            collectionOptions={collectionOptions}
            priceBounds={priceBounds}
            facets={facets}
            onFacetsChange={handleFacetsChange}
            showOutOfStock={showOutOfStock}
            onShowOutOfStockChange={actions.setShowOutOfStock}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={handleClearFilters}
          />
        </div>
      </BottomSheet>

      <div className="p-4 pb-28 md:p-6 lg:pb-6">
        {countLabel && (
          <p className="pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {countLabel}
          </p>
        )}

        <div className="py-2">
          <ProductGrid
            products={sortedDisplayProducts}
            isLoading={isLoading}
            isFetchingMore={isFetchingMore}
            hasMore={hasMore}
            hasFilters={hasActiveFilters || isSearchMode}
            showStockBadge={showStockBadge}
            storeCode={effectiveStoreCode}
            onLoadMore={handleLoadMore}
            onClearFilters={handleClearFilters}
            onRangeChanged={setVisibleRange}
          />
        </div>
        {!needsFullSweep && !isLoading && !hasMore && otherStores.length > 0 && (
          <div className="flex flex-col gap-5 pt-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Available at other stores
            </p>
            {otherStores.map((store) => (
              <OtherStoreSection
                key={`${store.company_id}-${activeCategoryId ?? 'all'}-${showOutOfStock}`}
                store={store}
                showOutOfStock={showOutOfStock}
                categoryId={activeCategoryId}
                sortBy={sortBy}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <CatalogScreen />
    </Suspense>
  );
}