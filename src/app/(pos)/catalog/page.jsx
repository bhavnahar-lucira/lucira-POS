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

// See the live-stock-recheck comment further down for why this exists and
// why it's capped the same way useLiveCatalogPrices' own window is.
const STOCK_CHECK_WINDOW = 300;

const selectActiveStoreId = (s) => s.store.activeStoreId;

// ── Client-side helpers ───────────────────────────────────────────────────────

function isInStock(product) {
  return product.has_stock === true;
}

/**
 * Resolves a search query against the categories list to matching type_ids.
 * Partial match, so "ring" matches "Rings", "mangal" matches "Mangalsutra".
 */
function getMatchingTypeIds(q, categories) {
  if (!q || !categories.length) return [];
  const lower = q.toLowerCase();
  return categories
    .filter((c) => c.type_name?.toLowerCase().includes(lower))
    .map((c) => c.type_id)
    .filter(Boolean);
}

/**
 * Client-side filter for search mode — filtering only, no sort. Runs against
 * this store's complete catalog (useAllCatalog / catalogService.getAllProducts):
 * text matching must happen client-side because the live inventory endpoint
 * has no working search parameter, and the one real full-text search that
 * exists (Items/List's ContainsText) can't be scoped to a single store's stock.
 *
 * Match logic (OR): item_code contains query (SKU), item_name contains query
 * (name), or type_id is in matchingTypeIds (category name). Category chip and
 * OOS toggle apply on top as AND.
 *
 * Sort is deliberately NOT done here — catalog/inventory rows never carry a
 * real price (price: null until useLiveCatalogPrices merges it in downstream),
 * so sorting at this stage would compare null against null. Sorting happens
 * once, in the page component, after live prices are merged (stableSortProducts).
 *
 * NOTE (2026-09-30): Sub Category/Karat/Metal Color/Diamond Shape/Item Size/
 * Collection/Weight/Diamond Weight are NOT applied here — those are now real
 * server-side ProductCatalog/List filters (see useCatalogProducts.js), which
 * only narrows BROWSE mode's own query. A text search runs against the
 * separate full-tenant sweep (useAllCatalog), which has no way to accept
 * these ids either — combining a text search with one of these filters is
 * therefore a known, accepted gap, same boundary the old bucket-facet system
 * already had (isFacetMode forced the sweep for facets; a real search still
 * wouldn't have known about a piece's karat/shape/etc there). Price still
 * applies in both modes — see visibleDisplayProducts below.
 */
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

/**
 * OOS + category chip — filter only, no sort, no text matching. For the fast
 * SKU-search interim results (see useSkuSearch), which are already
 * query-filtered by the server.
 */
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
  // A real text search (or a barcode scan, which lands here via
  // handleBarcodeDetected below — see useBarcodeLookup) always finds a real
  // match regardless of stock here — an operator typing/scanning a specific
  // code has already identified a real piece and expects to find it, same
  // as OrnaVerse's own item search (not scoped to one store's stock).
  // Reported directly (2026-09-30): keep this OUT of plain browse/facet
  // filtering — those stay governed by the operator's own "Include out of
  // stock" toggle exactly as before; only an actual search bypasses it.
  const searchShowOutOfStock = isSearchMode || showOutOfStock;

  // Every other store the operator is assigned to, for the "Available at
  // other stores" lane (gated on the primary store's list running out).
  const availableStores = useSelector(selectAvailableStores);
  const otherStores = useMemo(
    () => availableStores.filter((s) => s.company_id !== effectiveStoreId),
    [availableStores, effectiveStoreId]
  );

  // Stock badge must reflect effectiveStoreId (the store filter), not the
  // signed-in store — ProductCard's own Redux fallback is always the
  // signed-in store. Looked up from availableStores rather than a second
  // network round-trip.
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
    // Real server-side filters (2026-09-30 redesign) — see
    // useCatalogFilters.js's own header for why these replaced the old
    // client-side bucket facets. Only meaningful in browse mode; search
    // mode's separate full-sweep pool doesn't accept these (see
    // applySearchFilterOnly's own note).
    sub_type_ids:        facets.subTypeIds,
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

  // UNSORTED — sorting now happens once, after live prices are merged in
  // (see pricedDisplayProducts/sortedDisplayProducts below).
  const rawBrowseProducts = data?.products ?? [];

  // ── Search / facet mode ───────────────────────────────────────────────────
  // Two sources, combined: useAllCatalog (full store inventory, paginated in
  // the background — can take a while for a large store) gives fully accurate
  // name + SKU search once ready; useSkuSearch (instant server-side SKU
  // search) covers the interim while (1) is still loading.
  //
  // useAllCatalog is deferred until the user actually searches (a large store
  // can burst hundreds of requests, and most visits never search at all).
  // FILTERING no longer needs this sweep at all (2026-09-30) — every facet
  // except Price is now a real server-side ProductCatalog/List filter (see
  // the useCatalogProducts call above), so only a genuine text search still
  // needs the full-tenant pool. Once triggered it stays enabled regardless of
  // isSearchMode, so clearing it mid-fetch doesn't cancel the sync already in
  // flight. Latched via "adjust state during render" rather than an effect,
  // so the enabled flag is correct in the same render search mode first turns true.
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
    loadedCount, // rows swept so far — surfaced below so a facet filter's
                 // first (slow, full-catalog) load reads as "in progress",
                 // not "broken" (reported 2026-09-28 as "no products after
                 // refresh" — a facet in the URL forces this same slow path
                 // on every fresh load, same as it does for a text search).
  // The raw toggle, NOT searchShowOutOfStock — REVERTED 2026-09-30 (reported
  // directly: search got noticeably slower). Forcing the out-of-stock sweep
  // for every search meant paging up to 2000 rows instead of 500 (see
  // useAllCatalog's own SAFETY_MAX_PAGES) even when the fast SKU path below
  // already has the answer. An exact code/SKU match now survives entirely
  // through skuResults (see the merge below, both before AND after the slow
  // sweep finishes) — it doesn't need this sweep to also include
  // out-of-stock rows, so there's no reason to pay for the bigger one on
  // every search. A facet-only filter still uses the raw toggle either way.
  } = useAllCatalog(effectiveStoreId, { enabled: hasSearched, showOutOfStock });

  // Kept enabled for the WHOLE search session (not just pre-index) — same
  // fix, same reason, as useCategoryNameSearch below. FIXED 2026-09-30
  // (reported directly: search returns nothing for a real item_code/SKU) —
  // this used to stop (isSearchMode && !allReady) the instant the slow full
  // sweep finished, resetting skuResults to [] via its query key switching
  // to '' — so an out-of-stock exact match this fast path found during the
  // interim window silently vanished the moment allReady flipped true,
  // which is most of the time in practice (the sweep is often already
  // cached/fast). The raw-toggle-gated sweep (useAllCatalog above) never
  // contains an out-of-stock row at all, so nothing downstream could recover
  // it once this was gone.
  const {
    data: skuResults = [],
  } = useSkuSearch(isSearchMode ? searchQuery : '', effectiveStoreId);

  // Exact real per-piece SKU — Items/List (what useSkuSearch calls) doesn't
  // match this field at all (confirmed live), so a genuine SKU never
  // surfaces through that path no matter what. See useExactSkuSearch's own
  // header. Same "whole search session" lifetime as skuResults above.
  const {
    data: exactSkuResults = [],
  } = useExactSkuSearch(isSearchMode ? searchQuery : '', effectiveStoreId);

  // Category-name matches — a direct, server-side, type_ids-scoped query
  // (see useCategoryNameSearch's own header) — reliable and COMPLETE even
  // for a rare category, unlike allProducts once showOutOfStock is on: that
  // sweep is capped and confirmed live to miss real items deep in the raw
  // tenant order. Kept enabled for the WHOLE search session (not just
  // pre-index) and merged into the final result below rather than
  // discarded once the full sweep finishes — a correctly-found item used to
  // visibly disappear the moment allReady flipped true, since the old code
  // only used this as an interim result set.
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
    // The fast SKU path's own out-of-stock matches (searchBySku no longer
    // drops these — see that function's own header) — merged in below the
    // same way categoryNameMatches already is, so an exact code/SKU match
    // found here doesn't vanish the moment the slow full sweep finishes just
    // because the sweep itself (raw-toggle-gated, see useAllCatalog above)
    // never contained an out-of-stock row to begin with.
    const skuMatches = applyBasicFilterOnly(skuResults, { activeCategoryId, showOutOfStock: searchShowOutOfStock });
    // Exact per-piece SKU matches — a real match here always survives
    // regardless of stock/category filters (it's a single, deliberately
    // identified piece, not a browse result), same reasoning as the barcode
    // scanner's own fix.
    const exactSkuMatches = exactSkuResults;

    if (allReady) {
      const swept = applySearchFilterOnly(allProducts, {
        searchQuery,
        activeCategoryId,
        showOutOfStock,
        categories,           // ← passed so category name matching works
      });
      // Merge, don't replace — see this block's own header comment above
      // for why a reliable category-name/SKU match must never be dropped
      // just because the (necessarily capped, raw-toggle-scoped) sweep
      // finished loading.
      const seen = new Set(swept.map((p) => p.item_id));
      const extra = [...categoryNameMatches, ...skuMatches, ...exactSkuMatches].filter((p) => {
        if (seen.has(p.item_id)) return false;
        seen.add(p.item_id);
        return true;
      });
      return [...swept, ...extra];
    }
    // Full catalog still loading — show what the fast SKU + category-name +
    // exact-SKU paths have so far, deduped (a query can match more than one).
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
  // Still unsorted at this point — see sortedDisplayProducts below, which is
  // what actually renders.
  const displayProducts = needsFullSweep ? searchResults : rawBrowseProducts;

  // The grid's own real rendered range (ProductGrid's rangeChanged, backed
  // by react-virtuoso) — see useLiveCatalogPrices' own doc comment on
  // priorityItemIds for why this exists (reported: catalog pricing "takes
  // a lot of time" — prioritize whatever's actually in the DOM first, load
  // the rest in the background). Defaults to a plausible first screenful
  // so priority is sane for the brief moment before Virtuoso reports its
  // first real range.
  //
  // Indexed against displayProducts, NOT sortedDisplayProducts (what
  // ProductGrid actually renders) — using the sorted list here would be
  // circular (sortedDisplayProducts is derived from prices, which this
  // feeds into). The two orders can only diverge once a price-based sort
  // has real prices to reorder by, which is exactly when most items are
  // already settled and priority barely matters — an acceptable, self-
  // correcting approximation given the alternative is a genuine cycle.
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: 23 });
  const priorityItemIds = useMemo(
    () => displayProducts.slice(visibleRange.startIndex, visibleRange.endIndex + 1).map((p) => p.item_id),
    [displayProducts, visibleRange]
  );
  // Gated on "do we have anything to show yet", not on the fast paths'
  // own isLoading flags — those hooks are DISABLED (see useSkuSearch.js/
  // useCategoryNameSearch.js) whenever the query doesn't look like a SKU
  // or a category name, so a plain item-name query left BOTH permanently
  // isLoading:false regardless of whether the slower, authoritative full
  // sweep had actually finished — nothing marked as loading, searchResults
  // genuinely empty, so the empty-state message rendered instead of a
  // loading skeleton for however long the sweep took (reported as
  // "products sometimes vanish" after a search). Still doesn't block on
  // the sweep once ANY result exists, only when there's genuinely nothing
  // to show and the one source that could still find something hasn't
  // finished.
  const isLoading       = needsFullSweep ? (!allReady && searchResults.length === 0) : browseLoading;
  const isFetchingMore  = !needsFullSweep && isFetchingNextPage;
  const hasMore         = !needsFullSweep && !!hasNextPage;
  const showStockBadge  = true; // always show — badge content reflects actual stock status

  // Live (SetSalesItems) prices for items the fast tier couldn't price,
  // fetched in the background so they never block the page. Keyed on
  // effectiveStoreId, not reduxStoreId — pricing must follow whichever store
  // the catalog filter has on screen, not the signed-in store.
  const { priceById: livePriceById, settledIds } = useLiveCatalogPrices(displayProducts, { priorityItemIds, storeIdOverride: effectiveStoreId });

  // Live has_stock re-check — FIXED 2026-09-18 (reported: a sold-out SKU
  // still showed "In Stock"). ProductCatalog/List's own has_stock is just a
  // snapshot from whenever this page's cache was populated (up to 24h old —
  // it's cached as "master data" alongside genuinely immutable fields like
  // name/SKU/weight, see useCatalogProducts.js), so a real stock change
  // between that fetch and now never reflected until the cache expired.
  // getStockByStoresBatch is a real batch endpoint (one POST for many
  // item_ids, unlike Style/Retrieve/Nector — no queue needed), short-TTL
  // (STALE_TIME.STOCK, 1 min) — same mechanism Wishlist/Recently Viewed
  // already rely on for a trustworthy badge, now extended to the main grid
  // too. Capped to the first STOCK_CHECK_WINDOW ids for the same reason
  // useLiveCatalogPrices caps its own window: a name search can match the
  // store's entire catalog (thousands of rows via useAllCatalog), and this
  // endpoint takes the whole id list in ONE request body — unbounded here
  // means an unbounded single payload, not just "many requests".
  const stockCheckItemIds = useMemo(
    () => displayProducts.slice(0, STOCK_CHECK_WINDOW).map((p) => p.item_id).filter((id) => id != null),
    [displayProducts]
  );
  const { stockByItemId: liveStockByItemId } = useCrossStoreStockCodes(stockCheckItemIds);

  // Reuses the same merged object for an item whose price/is_pricing/has_stock
  // hasn't changed since the last tick, instead of building a new one for
  // every item on every settle-tick. ProductCard is React.memo'd so a card
  // whose fields haven't moved skips re-rendering — but only if it keeps the
  // same `product` object reference, hence this cache. "Adjust state during
  // render" is used instead of a ref because this repo's lint
  // (react-hooks/refs) forbids reading/writing a ref during render; same
  // idiom as stableSort below.
  const [mergeCache, setMergeCache] = useState(() => new Map());

  // MEMOIZED (reported: "the POS doesn't respond" after a search) — this
  // whole block used to be plain consts in the render body, so this full
  // .map() over the entire visible result set (which in search mode can be
  // the whole store-scoped slice of the 2,699+ item shared sweep) re-ran on
  // EVERY render of this component, not just when pricing/stock genuinely
  // changed — including each of the dozens of progressive settle-ticks
  // useLiveCatalogPrices fires while a large result set is still being
  // priced. Wrapped in useMemo so it only recomputes when the real inputs
  // change.
  //
  // mergeCache is deliberately OMITTED from the dependency array — it's
  // WRITTEN by this same computation (via setMergeCache below), not an
  // input that should trigger a recompute; including it would make every
  // write immediately trigger another read. This memo's function body is
  // still recreated fresh every render (closures always are), so a real
  // recompute always reads the current mergeCache — only a recompute that
  // ISN'T needed (because none of the listed deps moved) is skipped.
  const { mergedEntries, nextMergeCache } = useMemo(() => {
    const nextMergeCache = new Map();
    const mergedEntries = displayProducts.map((p) => {
      const price = p.price ?? livePriceById.get(p.item_id) ?? null;
      // Distinguishes "still coming" from "there will never be a number".
      const isPricing = price == null && !settledIds.has(p.item_id);

      // Falls back to the snapshot's own has_stock until the live check
      // resolves for this id — exactly like price falls back to "Pricing…"
      // rather than asserting a wrong number while unsettled. Scoped to
      // effectiveStoreCode specifically (not liveStock.hasStock, which is an
      // OR across every store the operator can access) — this grid shows one
      // store's stock, not "in stock somewhere".
      const liveStock = liveStockByItemId.get(p.item_id);
      const has_stock = liveStock ? liveStock.storeCodes.includes(effectiveStoreCode) : p.has_stock;

      // Compared on price/isPricing/has_stock content only, not object
      // reference — `products` from useCatalogProducts' select() can get a
      // fresh reference on every render during the fetching/refetching
      // transition right after a store switch, which previously caused an
      // update-depth-exceeded loop (same class of bug useLiveCatalogPrices hit
      // and fixed the same way). Trade-off: if a product's other fields
      // (name/image) changed while none of these three did, the reused entry
      // shows the old ones — accepted since those catalog fields are
      // effectively immutable per item_id within a session.
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

  // FIX (2026-09-18, reported: "Made to Order products visible even with the
  // out-of-stock toggle off"). There's no separate "Made to Order" flag
  // anywhere in this data model — it's just the display label this app
  // already uses for has_stock:false. Browse mode trusts OrnaVerse's own
  // has_stock from ProductCatalog/List directly (no client recompute), and
  // search mode's isInStock filter trusts that exact same flag — but
  // OrnaVerse appears to mark a zero-physical-piece-but-orderable item's
  // has_stock as true regardless of the show_out_of_stock param sent to it
  // (that same param has other confirmed non-obvious behavior — see
  // fetchEntireStoreCatalog's own note on it), so neither filter ever
  // excludes these. The live has_stock correction above (real
  // current_company_pieces via getStockByStoresBatch) is the one
  // trustworthy signal available — enforcing the toggle against IT, once it
  // resolves, is what actually removes these instead of just correcting
  // their badge. Only takes effect within the live-checked window (see
  // STOCK_CHECK_WINDOW); anything beyond it still relies on the
  // (occasionally wrong) snapshot, same as before this fix.
  // Price facet applies here, not alongside the other facets in
  // applySearchFilterOnly — `price` doesn't exist on a catalog row until
  // useLiveCatalogPrices merges it in above, so it's the one facet that has
  // to wait until after pricing settles rather than narrowing the pool
  // upfront (only relevant once at least one item has actually priced).
  const visibleDisplayProducts = useMemo(() => {
    let result = showOutOfStock ? pricedDisplayProducts : pricedDisplayProducts.filter((p) => p.has_stock === true);
    if (facets.priceMin != null || facets.priceMax != null) {
      result = applyPriceFilter(result, { priceMin: facets.priceMin, priceMax: facets.priceMax });
    }
    return result;
  }, [pricedDisplayProducts, showOutOfStock, facets.priceMin, facets.priceMax]);

  // Price filter's own slider bounds — see getPriceBounds' own header.
  // Computed from pricedDisplayProducts (pre-facet), not visibleDisplayProducts,
  // so the bounds don't shrink to match whatever the slider itself just
  // narrowed to.
  const priceBounds = useMemo(() => getPriceBounds(pricedDisplayProducts), [pricedDisplayProducts]);

  // Compared after building both maps, in a plain loop rather than a flag
  // mutated inside the .map() callback above — this repo's lint
  // (react-hooks/immutability) forbids reassigning a render-scoped variable
  // from inside a nested callback.
  let mergeCacheChanged = nextMergeCache.size !== mergeCache.size;
  if (!mergeCacheChanged) {
    for (const [id, entry] of nextMergeCache) {
      if (mergeCache.get(id) !== entry) { mergeCacheChanged = true; break; }
    }
  }
  if (mergeCacheChanged) setMergeCache(nextMergeCache);

  // Sort deliberately runs after pricing is merged in, not before —
  // compareProducts' price branch always sorts a still-pricing item after
  // every priced one so a card doesn't jump to the top while it still reads
  // "Pricing…". stableSortProducts also keeps already-rendered cards frozen
  // in place on pagination and only sorts/appends genuinely new rows, so an
  // infinite-scroll page fetch doesn't reshuffle cards the operator is
  // already scrolling past (a plain re-sort of the full list on every
  // fetchNextPage() used to do exactly that).
  //
  // sortResetKey forces a genuine fresh sort (not a frozen-prefix carry) only
  // when sort order, filter, store, mode, or query actually changes.
  //
  // FIXED (reported: "sorting filters are not working") — this must include
  // searchQuery. Typing a DIFFERENT search query while sort/category/OOS/
  // store stayed the same would otherwise never change this key, so
  // stableSortProducts would treat the previous query's item order as a
  // frozen prefix and only sort+append the genuinely-new matches after it —
  // real matches for the new query silently riding along in the old
  // query's order instead of being sorted properly.
  //
  // pricedSignature is a content signature, not a reference — comparing
  // `pricedDisplayProducts` by reference caused an update-depth-exceeded
  // crash right after a store switch, since useCatalogProducts' select() can
  // hand back a new array reference on every render during that transition
  // (same bug class as useLiveCatalogPrices, fixed the same way). Includes
  // has_stock so a live stock correction (see above) actually reaches
  // sortedDisplayProducts — without it here, a stock-only change (price
  // unchanged) would never look different enough to escape the frozen
  // stableSort.order carried over from the previous tick.
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
  // Shared with the Dashboard's "Scan Barcode" Quick Action — see
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

  // ── Count label ───────────────────────────────────────────────────────────
  // While isLoading, a facet/search filter's first sweep of a cold cache can
  // take a while (it pages the ENTIRE tenant catalog) — surfacing progress
  // here instead of staying silent is the fix for "refresh shows no
  // products" reading as broken (2026-09-28): it's genuinely still loading,
  // same as a text search always was, just not visibly so before this.
  const countLabel = useMemo(() => {
    if (isLoading) {
      return needsFullSweep && loadedCount > 0 ? `Scanning catalog… ${loadedCount} checked so far` : null;
    }
    const n = displayProducts.length;
    if (isSearchMode) return `${n} result${n !== 1 ? 's' : ''} for "${searchQuery}"`;
    return `${n} product${n !== 1 ? 's' : ''}${hasActiveFilters ? ' matching filters' : ''}`;
  }, [isLoading, needsFullSweep, loadedCount, displayProducts.length, isSearchMode, searchQuery, hasActiveFilters]);

  // ── Filter panel option lists ─────────────────────────────────────────────
  // Real server-fetched option lists (2026-09-30 redesign), not counted/
  // computed from whatever's currently loaded — matches OrnaVerse's own
  // panel, whose dropdowns are static master lists too, not scoped counts.
  const { options: subCategoryOptions, isLoading: subCategoryLoading } = useSubTypeOptions(activeCategoryId);
  const { options: karatOptions }       = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.KARAT);
  const { options: metalColorOptions }  = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.METAL_COLOR);
  const { options: diamondShapeOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.DIAMOND_SHAPE);
  const { options: collectionOptions }  = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.COLLECTION);
  const { options: itemSizeOptions }    = useItemSizeOptions();

  // A single batched actions.setFacets() call — see that action's own
  // comment in useCatalogFilters.js for the race this replaced (calling
  // several per-field actions here in sequence, each rebuilding the URL
  // from window.location.search on its own, meant a later call in the same
  // patch could clobber an earlier one before its router.replace() landed).
  const handleFacetsChange = useCallback((patch) => {
    actions.setFacets(patch);
  }, [actions]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    // No h-full here — the page grows to its natural content height (like
    // orders/invoices) so #main-content is the sole scroll container, which
    // is what the sticky filter bar below needs to stay pinned correctly.
    <div className="flex flex-col bg-background">

      {/* Sticky filter bar (same treatment as /orders and /invoices) — pins
          to the top of #main-content on scroll. Full-opacity bg-muted, not
          translucent, so cards don't show through once pinned. z-20 (not
          z-10) because ProductCard's wishlist heart is also `absolute z-10`
          with no stacking context of its own — equal z-index would let it
          show through the bar on tie-break.
          Desktop+tablet (md+) — below md this took up roughly half the
          mobile viewport on its own (reported directly); MobileSortFilterBar's
          floating pill + bottom sheets replace it below that breakpoint.
          Widened from lg to md (2026-09-28, explicit direction) — tablet
          should get the same "Filters" button as desktop, not the mobile
          floating pill. */}
      <div className="hidden md:block sticky top-0 z-20 px-4 pt-4 pb-3 md:px-6 md:pt-5 bg-muted border-b border-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search — left, grows to fill whatever space the controls on the
              right don't need (no cap, 2026-09-28: a fixed max-w-md left a
              wide gap of dead space on anything wider than a small laptop,
              reported directly) — always full-width on its own line below lg. */}
          <div className="w-full min-w-0 lg:flex-1">
            <ProductSearchBar
              value={searchQuery ?? ''}
              onSearch={handleSearch}
              onBarcodeDetected={handleBarcodeDetected}
            />
          </div>

          {/* Store / Sort / Filters — every control here is h-11 (2026-09-28:
              Filters used to default to the plain Button's h-9, visibly
              smaller than its neighbors, reported directly). The search bar
              on the left (lg:flex-1, no cap) takes up whatever room this
              group doesn't need, so the row fills the bar's actual width
              instead of leaving a dead gap between a capped search box and a
              tightly-clustered right-aligned group. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-stretch lg:shrink-0">
            <CatalogStoreSelector
              catalogStoreId={catalogStoreId}
              onStoreChange={actions.setCatalogStore}
            />
            <CatalogSortDropdown
              sortBy={sortBy}
              onSortChange={actions.setSortBy}
            />
            {/* Category AND Out of Stock moved INSIDE the Filters panel
                (2026-09-28, explicit direction) — Category used to sit alone
                as its own always-visible chip row below this bar, Out of
                Stock as its own standalone toggle here; both are now just
                more sections alongside Diamond Shape/Carat/Weight/Material/Price. */}
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
        // Static label (2026-09-28, reported: this used to show "Show 100
        // products" from browse mode's unfiltered page size even before any
        // filter was touched, reading as a real result count when it wasn't one).
        // Mobile also gets a "Clear All" alongside it (2026-10-01, matching
        // the reference mobile filter layout) — desktop/tablet keeps the
        // single full-width button, since ProductFilterPanel's own "Clear
        // all" link already covers that breakpoint.
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
          {/* Search/store live in the desktop+tablet sticky bar already
              (hidden md:block, above) — only needed here below md, where
              that bar doesn't render at all and this sheet is the sole way
              to reach them (previously MobileSortFilterBar's own separate
              sheet). Out of Stock moved into ProductFilterPanel itself
              (2026-09-28) — it's a filter, not page chrome. */}
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

        {/* Only shown once this store's catalog has genuinely run out (never
            during search) and the primary grid has settled, so it doesn't
            flash in ahead of real results on first paint. */}
        {!needsFullSweep && !isLoading && !hasMore && otherStores.length > 0 && (
          <div className="flex flex-col gap-5 pt-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Available at other stores
            </p>
            {otherStores.map((store) => (
              <OtherStoreSection
                // No effectiveStoreId here on purpose (reported directly,
                // 2026-09-30: store switching was slow) — otherStores already
                // filters OUT effectiveStoreId (see its own useMemo above),
                // so every section's own store.company_id never changes when
                // the operator's active store does. Including effectiveStoreId
                // in this key anyway forced React to unmount/remount EVERY
                // other-store section (not just a newly added/removed one) on
                // every single switch, discarding each one's already-cached
                // useCatalogProducts/useLiveCatalogPrices state and refiring
                // their fetches from scratch for stores that hadn't changed.
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