'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

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
    
    selectCategory: (slug) => {
      const value = slug === 'all' ? null : (slug ?? null);
      tracker.track(EVENTS.CATEGORY_FILTERED, { filter_name: 'category', filter_value: value ?? 'all' });
      setParam({ category: value, subCategory: null });
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
      const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
      const currentStore = new URLSearchParams(currentSearch).get('store');
      const next = new URLSearchParams();
      if (currentStore) next.set('store', currentStore);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
  }), [setParam, pathname, router]);

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