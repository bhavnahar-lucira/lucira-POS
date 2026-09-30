// Manages all catalog filter state, synced to URL query params.
// Covers: category, search, sortBy, showOutOfStock, catalogStoreId.

'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

/**
 * Sort options available in the catalog. Value is used in URL params and
 * matched client-side.
 */
export const SORT_OPTIONS = [
  { value: 'name_asc',    label: 'Name A → Z' },
  { value: 'name_desc',   label: 'Name Z → A' },
  { value: 'price_asc',   label: 'Price Low → High' },
  { value: 'price_desc',  label: 'Price High → Low' },
  { value: 'weight_asc',  label: 'Weight Low → High' },
  { value: 'weight_desc', label: 'Weight High → Low' },
];

export const DEFAULT_SORT = 'name_asc';

export function useCatalogFilters() {
  const router      = useRouter();
  const pathname    = usePathname();
  const params      = useSearchParams();

  const activeCategorySlug  = params.get('category')     ?? null;
  const searchQuery         = params.get('q')            ?? '';
  const sortBy              = params.get('sort')         ?? DEFAULT_SORT;
  const showOutOfStock      = params.get('oos')          === 'true';
  const catalogStoreId      = params.get('store')
    ? Number(params.get('store'))
    : null;

  // ── Direct server-side filters (2026-09-30 redesign) — Sub Category,
  // Karat, Metal Color, Diamond Shape, Item Size, Collection (id arrays) and
  // Weight/Diamond Weight (ranges), matching OrnaVerse's own real Filters
  // panel field-for-field (sub_type_ids/karat_ids/metal_ids/shape_ids/
  // item_size_ids/collection_ids/from_weight-to_weight/
  // from_diamond_weight-to_diamond_weight — confirmed live against their own
  // client). These replace the old client-side bucket facets, which existed
  // only because ProductCatalog/List was believed to have no server-side
  // filter for any of them — wrong (see catalogService.js's corrected
  // comment) — so every one of these now goes straight to the server via
  // useCatalogProducts, no full-tenant sweep required.
  //
  // Price stays a client-side-only range (rawPriceMin/rawPriceMax below):
  // ProductCatalog/List's own rows never carry a populated `price` field on
  // this tenant (see catalogService.js's PRICING note) — a server-side
  // from_price/to_price would filter against a value that's always null, so
  // Price still narrows whatever's already been live-priced instead.
  const rawSubCategory       = params.get('subCategory');
  const rawKarat             = params.get('karat');
  const rawMetalColor        = params.get('metalColor');
  const rawShape             = params.get('shape');
  const rawItemSize          = params.get('itemSize');
  const rawCollection        = params.get('collection');
  const rawWeightFrom        = params.get('weightFrom');
  const rawWeightTo          = params.get('weightTo');
  const rawDiamondWeightFrom = params.get('diamondWeightFrom');
  const rawDiamondWeightTo   = params.get('diamondWeightTo');
  const rawPriceMin          = params.get('priceMin');
  const rawPriceMax          = params.get('priceMax');

  // Memoized on the raw param STRINGS, not derived on every render as plain
  // consts — FIXED (2026-09-28, reported: pricing/results feel like they
  // "refetch on every filter click"). `facets` used to be a brand-new object
  // (with brand-new .split(',') arrays inside it) on every single render,
  // which fed straight into several useMemo dependency arrays elsewhere
  // (searchResults, facetOptions, useLiveCatalogPrices' inputs) — none of
  // those could ever actually memoize, so they recomputed on every render,
  // not just when a filter genuinely changed.
  const facets = useMemo(() => {
    const csvNum = (v) => (v ? v.split(',').map(Number) : []);
    return {
      subTypeIds:        csvNum(rawSubCategory),
      karatIds:          csvNum(rawKarat),
      metalColorIds:     csvNum(rawMetalColor),
      shapeIds:          csvNum(rawShape),
      itemSizeIds:       csvNum(rawItemSize),
      collectionIds:     csvNum(rawCollection),
      weightFrom:        rawWeightFrom        ? Number(rawWeightFrom)        : null,
      weightTo:          rawWeightTo          ? Number(rawWeightTo)          : null,
      diamondWeightFrom: rawDiamondWeightFrom ? Number(rawDiamondWeightFrom) : null,
      diamondWeightTo:   rawDiamondWeightTo   ? Number(rawDiamondWeightTo)   : null,
      priceMin:          rawPriceMin ? Number(rawPriceMin) : null,
      priceMax:          rawPriceMax ? Number(rawPriceMax) : null,
    };
  }, [
    rawSubCategory, rawKarat, rawMetalColor, rawShape, rawItemSize, rawCollection,
    rawWeightFrom, rawWeightTo, rawDiamondWeightFrom, rawDiamondWeightTo, rawPriceMin, rawPriceMax,
  ]);
  const {
    subTypeIds, karatIds, metalColorIds, shapeIds, itemSizeIds, collectionIds,
    weightFrom, weightTo, diamondWeightFrom, diamondWeightTo, priceMin, priceMax,
  } = facets;

  // Build the baseline from window.location.search rather than
  // useSearchParams()'s React-managed snapshot, which only updates on its
  // own render schedule — calling this again before a previous update has
  // been reflected could otherwise silently re-apply/restore a param this
  // call meant to remove. Falls back to the hook's snapshot pre-mount (SSR).
  const setParam = useCallback((updates) => {
    const currentSearch = typeof window !== 'undefined' ? window.location.search : `?${params.toString()}`;
    const next = new URLSearchParams(currentSearch);
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === '' || val === false) {
        next.delete(key);
      } else {
        next.set(key, String(val));
      }
    });
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  const actions = useMemo(() => ({
    setSearch: (q) => setParam({ q: q || null }),

    // Every filter action below fires its own tracked event — reported
    // directly: filter usage went completely untracked despite
    // CATEGORY_FILTERED existing in events.js with zero callers. `filter_name`
    // identifies WHICH filter (so it can be segmented/fetched in WebEngage);
    // customer_id/name are NOT passed explicitly here — tracker.track()
    // already pulls them from the active session automatically for every
    // event, same as CLICK/PAGE_VIEW do.
    selectCategory: (slug) => {
      const value = slug === 'all' ? null : (slug ?? null);
      tracker.track(EVENTS.CATEGORY_FILTERED, { filter_name: 'category', filter_value: value ?? 'all' });
      setParam({ category: value });
    },

    setSortBy: (val) => {
      tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'sort', filter_value: val });
      setParam({ sort: val === DEFAULT_SORT ? null : val });
    },

    setShowOutOfStock: (val) => {
      tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'out_of_stock', filter_value: val });
      setParam({ oos: val ? 'true' : null });
    },

    setCatalogStore: (storeId) => setParam({
      store: storeId ?? null,
    }),

    // Single batched facet update — FIXED (2026-09-28, reported: the Weight
    // panel's Diamond tab "isn't clickable"). Its onClick patches BOTH
    // weightMode and weightBuckets in one object; the old per-field
    // setShapes/setWeightMode/etc actions each called setParam separately,
    // and setParam rebuilds the URL from window.location.search — the
    // SECOND call in the same click handler ran before router.replace()
    // from the FIRST call had actually updated the address bar, so it read
    // the pre-update URL and clobbered the first change. One object in, one
    // setParam call out — no intermediate URL for a second call to race against.
    //
    // Tracking mirrors the same batching — one FILTER_APPLIED event per
    // facet key actually present in the patch (a "Weight: Diamond" tap
    // patches weightMode+weightBuckets together, so that's two events, one
    // per real change), not one vague "facets changed" event.
    setFacets: (patch) => {
      if ('subTypeIds'        in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'sub_category',    filter_value: patch.subTypeIds.join(',') || null });
      if ('karatIds'          in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'karat',           filter_value: patch.karatIds.join(',') || null });
      if ('metalColorIds'     in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'metal_color',     filter_value: patch.metalColorIds.join(',') || null });
      if ('shapeIds'          in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'diamond_shape',   filter_value: patch.shapeIds.join(',') || null });
      if ('itemSizeIds'       in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'item_size',       filter_value: patch.itemSizeIds.join(',') || null });
      if ('collectionIds'     in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'collection',      filter_value: patch.collectionIds.join(',') || null });
      if ('weightFrom'        in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'weight_from',     filter_value: patch.weightFrom });
      if ('weightTo'          in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'weight_to',       filter_value: patch.weightTo });
      if ('diamondWeightFrom' in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'diamond_weight_from', filter_value: patch.diamondWeightFrom });
      if ('diamondWeightTo'   in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'diamond_weight_to',   filter_value: patch.diamondWeightTo });
      if ('priceMin'          in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'price_min',       filter_value: patch.priceMin });
      if ('priceMax'          in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'price_max',       filter_value: patch.priceMax });

      setParam({
        ...('subTypeIds'    in patch && { subCategory: patch.subTypeIds.length    ? patch.subTypeIds.join(',')    : null }),
        ...('karatIds'      in patch && { karat:       patch.karatIds.length      ? patch.karatIds.join(',')      : null }),
        ...('metalColorIds' in patch && { metalColor:  patch.metalColorIds.length ? patch.metalColorIds.join(',') : null }),
        ...('shapeIds'      in patch && { shape:       patch.shapeIds.length      ? patch.shapeIds.join(',')      : null }),
        ...('itemSizeIds'   in patch && { itemSize:    patch.itemSizeIds.length   ? patch.itemSizeIds.join(',')   : null }),
        ...('collectionIds' in patch && { collection:  patch.collectionIds.length ? patch.collectionIds.join(',') : null }),
        ...('weightFrom'        in patch && { weightFrom:        patch.weightFrom        ?? null }),
        ...('weightTo'          in patch && { weightTo:          patch.weightTo          ?? null }),
        ...('diamondWeightFrom' in patch && { diamondWeightFrom: patch.diamondWeightFrom ?? null }),
        ...('diamondWeightTo'   in patch && { diamondWeightTo:   patch.diamondWeightTo   ?? null }),
        ...('priceMin'      in patch && { priceMin:    patch.priceMin ?? null }),
        ...('priceMax'      in patch && { priceMax:    patch.priceMax ?? null }),
      });
    },

    clearFilters: () => {
      tracker.track(EVENTS.FILTERS_CLEARED, {});
      // Same reasoning as setParam above — read the store param from the
      // real browser URL, not the potentially-lagging catalogStoreId closure.
      const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
      const currentStore = new URLSearchParams(currentSearch).get('store');
      const next = new URLSearchParams();
      // preserve the store scope across clear — it's a scope, not a filter
      if (currentStore) next.set('store', currentStore);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
  }), [setParam, pathname, router]);

  // ── hasActiveFilters — excludes store + sort (those aren't "filters") ──────
  // Out of Stock counts now too (2026-09-28) — it moved from its own
  // standalone toggle into the Filters panel itself, so it's a real filter now.
  const hasActiveFilters = !!(
    activeCategorySlug || searchQuery || showOutOfStock
    || subTypeIds.length || karatIds.length || metalColorIds.length
    || shapeIds.length || itemSizeIds.length || collectionIds.length
    || weightFrom != null || weightTo != null
    || diamondWeightFrom != null || diamondWeightTo != null
    || priceMin != null || priceMax != null
  );

  return {
    filters: {
      activeCategorySlug,
      searchQuery,
      sortBy,
      showOutOfStock,
      catalogStoreId,
      facets,
    },
    hasActiveFilters,
    actions,
  };
}