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

  // ── Facet filters (2026-09-28) — Diamond Shape, Carat, Weight, Material,
  // Price. See lib/catalogFacets.js for why these are all applied
  // client-side (ProductCatalog/List has no server-side filter for any of
  // them) and why there's no Size facet (no ring-size field on this endpoint).
  const rawShape        = params.get('shape');
  const rawMaterial     = params.get('material');
  const rawCarat        = params.get('carat');
  const rawWeightMode   = params.get('weightMode');
  const rawWeight       = params.get('weight');
  const rawPriceMin     = params.get('priceMin');
  const rawPriceMax     = params.get('priceMax');

  // Memoized on the raw param STRINGS, not derived on every render as plain
  // consts — FIXED (2026-09-28, reported: pricing/results feel like they
  // "refetch on every filter click"). `facets` used to be a brand-new object
  // (with brand-new .split(',') arrays inside it) on every single render,
  // which fed straight into several useMemo dependency arrays elsewhere
  // (searchResults, facetOptions, useLiveCatalogPrices' inputs) — none of
  // those could ever actually memoize, so they recomputed on every render,
  // not just when a filter genuinely changed.
  const facets = useMemo(() => {
    const csv = (v) => (v ? v.split(',') : []);
    return {
      shapes:        csv(rawShape),
      materials:     csv(rawMaterial),
      caratBuckets:  csv(rawCarat),
      weightMode:    rawWeightMode === 'diamond' ? 'diamond' : 'gold',
      weightBuckets: csv(rawWeight),
      priceMin:      rawPriceMin ? Number(rawPriceMin) : null,
      priceMax:      rawPriceMax ? Number(rawPriceMax) : null,
    };
  }, [rawShape, rawMaterial, rawCarat, rawWeightMode, rawWeight, rawPriceMin, rawPriceMax]);
  const { shapes, materials, caratBuckets, weightBuckets, priceMin, priceMax } = facets;

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
      if ('shapes'       in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'shape',        filter_value: patch.shapes.join(',') || null });
      if ('materials'    in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'material',     filter_value: patch.materials.join(',') || null });
      if ('caratBuckets' in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'carat',        filter_value: patch.caratBuckets.join(',') || null });
      if ('weightMode'   in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'weight_mode',  filter_value: patch.weightMode });
      if ('weightBuckets'in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'weight',       filter_value: patch.weightBuckets.join(',') || null });
      if ('priceMin'     in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'price_min',    filter_value: patch.priceMin });
      if ('priceMax'     in patch) tracker.track(EVENTS.FILTER_APPLIED, { filter_name: 'price_max',    filter_value: patch.priceMax });

      setParam({
        ...('shapes'        in patch && { shape:      patch.shapes.length      ? patch.shapes.join(',')      : null }),
        ...('materials'     in patch && { material:   patch.materials.length   ? patch.materials.join(',')   : null }),
        ...('caratBuckets'  in patch && { carat:      patch.caratBuckets.length ? patch.caratBuckets.join(',') : null }),
        ...('weightMode'    in patch && { weightMode: patch.weightMode === 'diamond' ? 'diamond' : null }),
        ...('weightBuckets' in patch && { weight:     patch.weightBuckets.length ? patch.weightBuckets.join(',') : null }),
        ...('priceMin'      in patch && { priceMin:   patch.priceMin ?? null }),
        ...('priceMax'      in patch && { priceMax:   patch.priceMax ?? null }),
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
    || shapes.length || materials.length
    || caratBuckets.length || weightBuckets.length
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