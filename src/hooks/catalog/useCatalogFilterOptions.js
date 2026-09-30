// Option lists for the catalog Filters panel's Sub Category / Karat / Metal
// Color / Diamond Shape / Item Size / Collection dropdowns — every one of
// these, and the ProductCatalog/List request fields they drive
// (sub_type_ids/karat_ids/metal_ids/shape_ids/item_size_ids/collection_ids),
// was confirmed live 2026-09-30 by directly cross-checking OrnaVerse's own
// real POS client's Filters panel and its resulting network requests.

'use client';

import { useQuery } from '@tanstack/react-query';
import { getSubTypeDetails } from '@/services/categoryService';
import { getItemAttributes, getItemSizes } from '@/services/itemService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * Sub Category options for one selected category (type_id) — disabled
 * (matching OrnaVerse's own "Select a category first") until a category is
 * actually chosen.
 * @param {number|null} typeId
 * @returns {{ options: {value:number,label:string}[], isLoading: boolean }}
 */
export function useSubTypeOptions(typeId) {
  const query = useQuery({
    queryKey:  QUERY_KEYS.CATEGORIES.SUBTYPE_DETAILS(typeId),
    queryFn:   () => getSubTypeDetails(typeId),
    enabled:   !!typeId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    select:    (data) => (data?.Entities ?? []).map((e) => ({
      value: e.sub_type_id, label: e.sub_type_name || e.sub_type_code,
    })),
  });
  return { options: query.data ?? [], isLoading: query.isLoading };
}

/**
 * Karat / Metal Color / Diamond Shape / Collection options — all the same
 * Attributes/List endpoint, distinguished only by attribute_type_id (see
 * APP_CONFIG.ATTRIBUTE_TYPES). attribute_id 0 is the endpoint's own generic
 * "NA" placeholder row (shared across every attribute_type_id, confirmed in
 * the raw responses) — filtered out, it isn't a real option any dropdown
 * shows.
 * @param {number} attributeTypeId
 */
export function useAttributeOptions(attributeTypeId) {
  const query = useQuery({
    queryKey:  QUERY_KEYS.ITEMS.ATTRIBUTES(attributeTypeId),
    queryFn:   () => getItemAttributes(attributeTypeId),
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    select:    (res) => (res?.data?.Entities ?? [])
      .filter((a) => a.attribute_id > 0)
      .map((a) => ({ value: a.attribute_id, label: a.attribute_name || a.attribute_code }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  });
  return { options: query.data ?? [], isLoading: query.isLoading };
}

/**
 * Item Size options — one flat, unfiltered list shared across every
 * category (no type_id-scoped variant exists — see getItemSizes' own
 * header). Deduped by item_size_id: the same size code (e.g. "14") appears
 * once per category it belongs to on the raw endpoint, but item_size_ids is
 * a single global filter field, so only one row per id should ever render.
 */
export function useItemSizeOptions() {
  const query = useQuery({
    queryKey:  QUERY_KEYS.ITEMS.SIZES(),
    queryFn:   getItemSizes,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    select:    (res) => {
      const rows = res?.data?.Entities ?? [];
      const seen = new Map();
      for (const r of rows) {
        if (!seen.has(r.item_size_id)) {
          seen.set(r.item_size_id, { value: r.item_size_id, label: r.item_size_name || r.item_size_code });
        }
      }
      return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
    },
  });
  return { options: query.data ?? [], isLoading: query.isLoading };
}
