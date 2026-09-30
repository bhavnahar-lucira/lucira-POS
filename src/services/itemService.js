// Service functions for product item master data.
// One function per endpoint — no business logic.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import { createConcurrencyQueue } from '@/lib/concurrencyQueue';

/**
 * Fetches full product detail for a single item.
 * @param {number} entityId — item_id from catalog
 */
export const getItemDetail = (entityId) =>
  axiosInstance.post(API.ITEMS.RETRIEVE, { EntityId: entityId });

/**
 * Fetches product attributes of a specific type
 * (e.g. purity, stone type, finish).
 * @param {number} attributeTypeId
 */
export const getItemAttributes = (attributeTypeId) =>
  axiosInstance.post(API.ITEMS.ATTRIBUTES, {
    Take: 0,
    attribute_type_id: attributeTypeId,
  });

/**
 * Fetches every item size (ring/bangle/chain/etc, mixed together — no
 * type_id-scoped variant exists, confirmed against OrnaVerse's own real
 * client: its "Item Size" filter dropdown shows this same unfiltered list
 * regardless of category). Used by the catalog Filters panel's "Item Size"
 * dropdown.
 */
export const getItemSizes = () =>
  axiosInstance.post(API.ITEMS.SIZES, { Take: 5000 });

/**
 * Fetches all style variants for a given style_id.
 * Returns style_variants[] — each variant is a purchasable SKU
 * with its own item_id, karat, metal color, and size.
 * Maps to: POST Services/Master/Style/GetDesigns
 * @param {number} styleId — style_id from Items/Retrieve
 */
export const getDesignVariants = (styleId) =>
  axiosInstance.post(API.ITEMS.DESIGN_DETAIL, {
    EntityId: styleId,
  });

/**
 * Same call, routed through a shared concurrency-capped queue. Style/Retrieve
 * is a single-EntityId RPC with no batch variant, and the catalog grid isn't
 * virtualized — every mounted ProductCard resolves its style independently
 * (useStyleExternalProductId, useDesignVariants share this queryFn's cache
 * key). Confirmed live 2026-09-18: with ~100 cards mounted at once, calling
 * getDesignVariants directly from every one of them floods the browser's
 * connection pool and can take minutes to drain, even though each individual
 * call is fast. Both catalog-facing hooks use this queued version instead —
 * checkoutPricingService's one-off single-style lookup still uses the plain
 * function above, since it's never called from a large mounted list.
 */
export const getDesignVariantsQueued = createConcurrencyQueue(getDesignVariants, { concurrency: 6 });

/**
 * Search the master item catalogue by SKU/code substring — NOT scoped to
 * current-store stock (unlike catalogService's searchBySku). Used by
 * Exchange/Buyback, where the item being handed in by the customer isn't
 * necessarily in this store's live stock; only its master record (weight,
 * purity, item_rate) matters for valuation.
 *
 * item_search matches item_code substrings only (confirmed elsewhere in
 * this app) — not item_name.
 * @param {string} query
 * @returns {Promise<object>} { Entities: ItemRow[] }
 */
export async function searchMasterItems(query) {
  if (!query || query.trim().length < 2) return { Entities: [] };
  const response = await axiosInstance.post(API.ITEMS.LIST, {
    item_search: query.trim(),
    Take: 20,
  });
  return response.data;
}