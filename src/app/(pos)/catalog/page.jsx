'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter }   from 'next/navigation';
import { useSelector } from 'react-redux';
import { toast }       from 'react-toastify';

import { useCatalogFilters }     from '@/hooks/catalog/useCatalogFilters';
import { useCatalogProducts }    from '@/hooks/catalog/useCatalogProducts';
import { useAllCatalog }         from '@/hooks/catalog/useAllCatalog';
import { useSkuSearch }          from '@/hooks/catalog/useSkuSearch';
import { useCategoryNameSearch } from '@/hooks/catalog/useCategoryNameSearch';
import { useCategories }         from '@/hooks/catalog/useCategoryFilters';
import { useLiveCatalogPrices }  from '@/hooks/catalog/useLiveCatalogPrices';
import { useCrossStoreStockCodes } from '@/hooks/catalog/useCrossStoreStockCodes';
import { getStockPieceBySku, createItemEnquiry } from '@/services/inventoryService';

import CategoryFilter        from '@/components/features/catalog/CategoryFilter';
import ProductGrid           from '@/components/features/catalog/ProductGrid';
import ProductSearchBar      from '@/components/features/catalog/ProductSearchBar';
import CatalogSortDropdown   from '@/components/features/catalog/CatalogSortDropdown';
import CatalogStoreSelector  from '@/components/features/catalog/CatalogStoreSelector';
import OutOfStockToggle      from '@/components/features/catalog/OutOfStockToggle';
import CatalogSkeleton       from '@/components/features/catalog/CatalogSkeleton';
import OtherStoreSection     from '@/components/features/catalog/OtherStoreSection';
import MobileSortFilterBar   from '@/components/features/catalog/MobileSortFilterBar';

import { stableSortProducts } from '@/lib/catalogSort';
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
  } = filters;

  const effectiveStoreId = catalogStoreId ?? reduxStoreId;
  const isSearchMode     = !!searchQuery && searchQuery.length >= SEARCH.MIN_QUERY_LENGTH;

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
  });

  // UNSORTED — sorting now happens once, after live prices are merged in
  // (see pricedDisplayProducts/sortedDisplayProducts below).
  const rawBrowseProducts = data?.products ?? [];

  // ── Search mode ───────────────────────────────────────────────────────────
  // Two sources, combined: useAllCatalog (full store inventory, paginated in
  // the background — can take a while for a large store) gives fully accurate
  // name + SKU search once ready; useSkuSearch (instant server-side SKU
  // search) covers the interim while (1) is still loading.
  //
  // useAllCatalog is deferred until the user actually searches (a large store
  // can burst hundreds of requests, and most visits never search at all).
  // Once triggered it stays enabled regardless of isSearchMode, so clearing
  // the search box mid-fetch doesn't cancel the sync already in flight.
  // Latched via "adjust state during render" rather than an effect, so the
  // enabled flag is correct in the same render isSearchMode first turns true.
  const [hasSearched, setHasSearched]           = useState(isSearchMode);
  const [prevIsSearchMode, setPrevIsSearchMode] = useState(isSearchMode);
  if (isSearchMode !== prevIsSearchMode) {
    setPrevIsSearchMode(isSearchMode);
    if (isSearchMode) setHasSearched(true);
  }

  const {
    data:        allProducts = [],
    isLoading:   allLoading,
    isSuccess:   allReady,
    isError:     allError,
  // showOutOfStock (2026-09-23) — without this, the toggle had zero effect
  // on text search: the shared sweep never contained an out-of-stock item
  // regardless of what the operator picked. See useAllCatalog's own header
  // for the separate, larger pool this switches to (own cache key, only
  // fetched once the operator actually turns the toggle on).
  } = useAllCatalog(effectiveStoreId, { enabled: hasSearched, showOutOfStock });

  const {
    data: skuResults = [],
  } = useSkuSearch(isSearchMode && !allReady ? searchQuery : '', effectiveStoreId);

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
    if (!isSearchMode) return [];

    const categoryNameMatches = applyBasicFilterOnly(categoryNameResults, { activeCategoryId, showOutOfStock });

    if (allReady) {
      const swept = applySearchFilterOnly(allProducts, {
        searchQuery,
        activeCategoryId,
        showOutOfStock,
        categories,           // ← passed so category name matching works
      });
      // Merge, don't replace — see this block's own header comment above
      // for why a reliable category-name match must never be dropped just
      // because the (necessarily capped) sweep finished loading.
      const seen = new Set(swept.map((p) => p.item_id));
      const extra = categoryNameMatches.filter((p) => !seen.has(p.item_id));
      return [...swept, ...extra];
    }
    // Full catalog still loading — show what the fast SKU + category-name
    // paths have so far, deduped (a query can match both).
    const seen = new Set();
    const merged = [...skuResults, ...categoryNameMatches].filter((p) => {
      if (seen.has(p.item_id)) return false;
      seen.add(p.item_id);
      return true;
    });
    return applyBasicFilterOnly(merged, { activeCategoryId, showOutOfStock });
  }, [
    isSearchMode, allReady, allProducts, skuResults, categoryNameResults,
    searchQuery, activeCategoryId, showOutOfStock, categories,
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
  const displayProducts = isSearchMode ? searchResults : rawBrowseProducts;

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
  const isLoading       = isSearchMode ? (!allReady && searchResults.length === 0) : browseLoading;
  const isFetchingMore  = !isSearchMode && isFetchingNextPage;
  const hasMore         = !isSearchMode && !!hasNextPage;
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
  const visibleDisplayProducts = useMemo(
    () => (showOutOfStock ? pricedDisplayProducts : pricedDisplayProducts.filter((p) => p.has_stock === true)),
    [pricedDisplayProducts, showOutOfStock]
  );

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
  const sortResetKey = `${sortBy}|${activeCategoryId ?? ''}|${showOutOfStock}|${effectiveStoreId ?? ''}|${isSearchMode}|${searchQuery}`;
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
  // Only calls the SKU lookup — no fallback to item_code matching or
  // actions.setSearch(). A scan is a targeted, instant lookup; it should say
  // found or not found and stop, not flip on isSearchMode and trigger
  // useAllCatalog's full-catalog background index on a miss. See
  // getStockPieceBySku for the company_id requirement this endpoint has on
  // live.
  const handleBarcodeDetected = useCallback(async (code) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    try {
      const skuResponse = await getStockPieceBySku({ sku: trimmed, companyId: effectiveStoreId });
      const skuMatch = skuResponse.data?.Entities?.[0];

      if (skuMatch?.item_id && (skuMatch.company_id == null || skuMatch.company_id === effectiveStoreId)) {
        tracker.track(EVENTS.BARCODE_SCANNED, { code: trimmed, itemId: skuMatch.item_id });

        // Best-effort, fire-and-forget logging (mirrors OrnaVerse's own POS) —
        // must never block or fail the actual navigation below.
        createItemEnquiry({
          itemId:          skuMatch.item_id,
          itemAttributeId: skuMatch.item_attribute_id,
          companyId:       skuMatch.company_id ?? effectiveStoreId,
          itemLineNo:      skuMatch.item_line_no,
          sku:             skuMatch.sku,
          image:           skuMatch.image,
        }).catch((err) => {
          console.warn('[BarcodeScanner] item enquiry log failed (non-blocking)', { sku: trimmed, err });
        });

        router.push(`/products/${skuMatch.item_id}`);
        return;
      }

      if (skuMatch?.item_id) {
        // Matched a real piece, just not one this store holds — SKUs are
        // expected to be unique per piece, so this should be rare.
        console.warn('[BarcodeScanner] sku matched a piece at a different store', {
          sku: trimmed, matchedCompanyId: skuMatch.company_id, activeStoreId: effectiveStoreId,
        });
      }

      tracker.track(EVENTS.BARCODE_SCAN_FAILED, { code: trimmed });
      toast.error(`No product found for scanned code "${trimmed}".`);
    } catch (err) {
      console.error('[BarcodeScanner] sku lookup request failed', { sku: trimmed, err });
      tracker.track(EVENTS.BARCODE_SCAN_FAILED, { code: trimmed });
      toast.error('Could not look up the scanned barcode. Please try again.');
    }
  }, [effectiveStoreId, router]);

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
  const countLabel = useMemo(() => {
    if (isLoading) return null;
    const n = displayProducts.length;
    if (isSearchMode) return `${n} result${n !== 1 ? 's' : ''} for "${searchQuery}"`;
    return `${n} product${n !== 1 ? 's' : ''}${hasActiveFilters ? ' matching filters' : ''}`;
  }, [isLoading, displayProducts.length, isSearchMode, searchQuery, hasActiveFilters]);

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
          Desktop-only (lg+) — below lg this took up roughly half the mobile
          viewport on its own (reported directly); MobileSortFilterBar's
          floating pill + bottom sheets replace it below that breakpoint. */}
      <div className="hidden lg:block sticky top-0 z-20 px-4 pt-4 pb-3 md:px-6 md:pt-5 bg-muted border-b border-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search — left, grows on wide screens but caps out so it doesn't
              dominate the row; always full-width on its own line below lg */}
          <div className="w-full min-w-0 lg:max-w-md lg:flex-1">
            <ProductSearchBar
              value={searchQuery ?? ''}
              onSearch={handleSearch}
              onBarcodeDetected={handleBarcodeDetected}
            />
          </div>

          {/* Filters — right on desktop; below sm, store+sort share a row and
              the toggle spans full width so the row uses all available space
              instead of stacking three narrow boxes with dead space beside them */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:ml-auto lg:shrink-0">
            <CatalogStoreSelector
              catalogStoreId={catalogStoreId}
              onStoreChange={actions.setCatalogStore}
            />
            <CatalogSortDropdown
              sortBy={sortBy}
              onSortChange={actions.setSortBy}
            />
            <div className="col-span-2 sm:col-auto sm:contents">
              <OutOfStockToggle
                showOutOfStock={showOutOfStock}
                onToggle={actions.setShowOutOfStock}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border">
          <CategoryFilter
            categories={categories}
            activeCategorySlug={activeCategorySlug}
            hasActiveFilters={hasActiveFilters}
            onSelectCategory={actions.selectCategory}
            onClearFilters={handleClearFilters}
          />
        </div>
      </div>

      <MobileSortFilterBar
        sortBy={sortBy}
        onSortChange={actions.setSortBy}
        searchQuery={searchQuery}
        onSearch={handleSearch}
        onBarcodeDetected={handleBarcodeDetected}
        catalogStoreId={catalogStoreId}
        onStoreChange={actions.setCatalogStore}
        showOutOfStock={showOutOfStock}
        onShowOutOfStockChange={actions.setShowOutOfStock}
        categories={categories}
        activeCategorySlug={activeCategorySlug}
        hasActiveFilters={hasActiveFilters}
        onSelectCategory={actions.selectCategory}
        onClearFilters={handleClearFilters}
      />

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
        {!isSearchMode && !isLoading && !hasMore && otherStores.length > 0 && (
          <div className="flex flex-col gap-5 pt-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Available at other stores
            </p>
            {otherStores.map((store) => (
              <OtherStoreSection
                key={`${store.company_id}-${effectiveStoreId}-${activeCategoryId ?? 'all'}-${showOutOfStock}`}
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