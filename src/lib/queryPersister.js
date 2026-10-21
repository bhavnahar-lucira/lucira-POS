// src/lib/queryPersister.js
//
// Persists a DELIBERATELY NARROW slice of the query cache to IndexedDB (via
// idb-keyval) so it survives a full page reload/browser restart, not just
// in-session navigation — the catalog can page through a store's entire
// inventory, and without persistence any reload re-fetches all of it.
//
// SCOPE (see PERSISTED_QUERY_KEY_PREFIXES below): only 'catalog'/'products'
// (the main grid), 'catalog'/'all' (whole-store search index), and
// 'shopify'/'product-images'. This is an ALLOW-list, not a block-list — a
// new query type is excluded by default unless added here, so this can't
// silently start persisting something sensitive (price, stock, cart,
// customer data). Nothing price-related is ever on this list — prices stay
// live via hooks/catalog/usePricingEpoch.js's own change-detector, untouched
// by this file. Everything persisted here is "master data" (name, SKU,
// weight, karat, image URLs) that's safe to show slightly stale for the
// 24h window.
//
// STORAGE — IndexedDB, not localStorage: a full store catalog plus image
// URLs can exceed localStorage's ~5-10MB quota and its synchronous API
// would block the main thread; IndexedDB's quota is far larger and async.

import { get, set, del } from 'idb-keyval';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const IDB_KEY = 'lucira-pos-query-cache';

// createAsyncStoragePersister wants a localStorage-shaped API
// (getItem/setItem/removeItem returning promises) — idb-keyval's get/set/del
// already return promises, just under different names.
const idbStorage = {
  getItem: (key) => get(key),
  setItem: (key, value) => set(key, value),
  removeItem: (key) => del(key),
};

export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: IDB_KEY,
  // NOTE: createAsyncStoragePersister does NOT read a `buster` option here —
  // it's silently dropped. The real buster is PERSIST_BUSTER below, passed
  // to PersistQueryClientProvider's top-level persistOptions instead.
});

// 24h window. Each persisted query's own gcTime must be at least this long
// too (set on useAllCatalog/useShopifyProductImages directly) or TanStack
// drops it from the in-memory cache before there's anything left to persist.
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

// Bump this string (not a date — a date would defeat the 24h window by
// invalidating everything daily) whenever a persisted query's cached shape
// or result set changes incompatibly, so browsers with the old cached
// result don't keep serving it silently for up to 24h instead of re-fetching.
// v1 -> v2 (2026-09-09): fetchEntireStoreCatalog's result set changed
// incompatibly (company-scoping fix).
export const PERSIST_BUSTER = 'v2';

const PERSISTED_QUERY_KEY_PREFIXES = [
  ['catalog', 'products'],
  ['catalog', 'all'],
  ['shopify', 'product-images'],
  // Per-card style→Shopify-ID lookup + review rating average (both now
  // MASTER_DATA-cached, see useStyleExternalProductId/useProductReviewSummary)
  // — without this, every reload re-ran both per visible card even though
  // neither value realistically changes within the 24h window.
  ['items', 'design-variants'],
  ['reviews', 'summary'],
];

function matchesPrefix(queryKey, prefix) {
  return prefix.every((segment, i) => queryKey[i] === segment);
}

/**
 * ALLOW-list predicate for persistQueryClientSave's dehydrateOptions.
 * Only successful queries are ever considered — a disabled query (e.g.
 * useAllCatalog before a search happens) sits at status 'pending' forever
 * and has nothing useful to restore.
 */
export function shouldPersistQuery(query) {
  if (query.state.status !== 'success') return false;
  return PERSISTED_QUERY_KEY_PREFIXES.some((prefix) => matchesPrefix(query.queryKey, prefix));
}
