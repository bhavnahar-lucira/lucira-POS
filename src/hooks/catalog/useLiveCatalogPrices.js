// Background live-price fill-in for catalog products. Prices come from
// Services/Helpers/SetSalesItems, which is slow (~6-7s per ~15-item batch),
// so catalogService's getProducts/getAllProducts don't await it inline —
// this hook fills prices in out-of-band so pages render immediately.
//
// Prices are cached per item_id in the TanStack cache (survives navigating
// away and back; a full reload starts empty) so a return visit paints
// instantly. Correctness under caching relies on the pricing EPOCH (see
// usePricingEpoch) baked into every query key here: while the epoch holds,
// cached prices are known-correct and kept with `staleTime: Infinity`; when
// it changes, every key changes with it and the catalog reprices. Saving a
// metal rate in Settings also invalidates the epoch directly as a
// convenience (see useAddMetalRate), since rates set in OrnaVerse's ERP
// itself have no in-app invalidation path.
//
// Per-item cache keys must not become per-item network calls: each item's
// queryFn enqueues into a module-level batcher that coalesces ids over a
// short window, then fetches them in chunks with limited concurrency (one
// SetSalesItems call per CHUNK_SIZE items). Every item's promise settles
// from its own chunk, so prices fill in progressively.

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getLivePricesForItems } from '@/services/catalogService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { usePricingEpoch } from '@/hooks/catalog/usePricingEpoch';

const DEBOUNCE_MS = 200;
// Smaller than ProductCatalog/List's 24-row page on purpose: SetSalesItems is
// slow, so smaller batches return sooner, fail smaller, and let prices appear
// progressively.
const CHUNK_SIZE  = 8;
const CONCURRENCY = 3;
// An item is retried only if the server never answered for it (network/500).
// A priced-at-0 verdict is final, so this bounds real failures only.
const MAX_ATTEMPTS = 3;

// How long an unobserved price survives in memory. Leaving /catalog drops
// every observer, so this (not staleTime, which is Infinity) decides whether
// a return visit still finds its prices. Correctness doesn't depend on it —
// the epoch handles that — so it's sized generously to outlast a shift.
const PRICE_GC_TIME = 12 * 60 * 60 * 1000; // 12h

// Fallback cache window used only when the epoch is blind (see
// usePricingEpoch) — long enough to spare the slow sweep on ordinary
// navigation, short enough to self-correct.
const BLIND_FALLBACK_STALE = 60 * 60 * 1000; // 1h

// Hard ceiling on how many items are priced at once. displayProducts can be
// a name-search result matching thousands of rows on a large store; pricing
// all of them would open thousands of query observers. Items beyond the
// window keep reading "Pricing…" (we genuinely haven't asked) rather than
// being asserted unpriceable.
const PRICE_WINDOW = 240;

// One bucket per store: the price of an item depends on which physical piece
// that store holds, so ids for different stores must never share a batch.

const buckets = new Map(); // storeId -> { waiters: Map<itemId, deferred[]>, timer }

function getBucket(storeId) {
  let bucket = buckets.get(storeId);
  if (!bucket) {
    bucket = { waiters: new Map(), timer: null };
    buckets.set(storeId, bucket);
  }
  return bucket;
}

/**
 * Queue one item for pricing and get a promise for its result.
 * Resolves to a number (priced), or null (the server answered but priced it
 * at 0 — a real "cannot be sold" verdict, currently every Silver925 item).
 * Rejects only when the server never reached a verdict, so TanStack's retry
 * covers transient failures without re-asking about settled items.
 */
function enqueuePrice(itemId, storeId) {
  return new Promise((resolve, reject) => {
    const bucket = getBucket(storeId);
    const existing = bucket.waiters.get(itemId);
    if (existing) existing.push({ resolve, reject });
    else bucket.waiters.set(itemId, [{ resolve, reject }]);

    // A LEADING window, not a trailing debounce: the first id starts the
    // clock and everything arriving within it joins the same batch. A
    // trailing timer would reset on every new id, so continuous scrolling
    // could starve the batch and never fire at all.
    if (!bucket.timer) {
      bucket.timer = setTimeout(() => flush(storeId), DEBOUNCE_MS);
    }
  });
}

async function flush(storeId) {
  const bucket = getBucket(storeId);
  bucket.timer = null;

  const waiters = bucket.waiters;
  bucket.waiters = new Map(); // ids arriving from here on start the next batch
  if (!waiters.size) return;

  const ids = [...waiters.keys()];
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) chunks.push(ids.slice(i, i + CHUNK_SIZE));

  const settle = (id, fn) => (waiters.get(id) ?? []).forEach(fn);

  let cursor = 0;
  async function worker() {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor++];
      try {
        const { prices, answered } = await getLivePricesForItems(chunk, storeId);
        for (const id of chunk) {
          if (answered.has(id)) {
            // Settled for good — a price, or a confirmed unpriceable verdict.
            const value = prices.get(id) ?? null;
            settle(id, (w) => w.resolve(value));
          } else {
            // No verdict reached. Reject so TanStack retries this item
            // instead of caching a permanent blank, which is what left a
            // whole page unpriced after one transient 500.
            settle(id, (w) => w.reject(new Error(`No price verdict for item ${id}`)));
          }
        }
      } catch (err) {
        // getLivePricesForItems swallows its own errors, so this is
        // defensive — but an unpriced chunk must never leave promises hanging.
        for (const id of chunk) settle(id, (w) => w.reject(err));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker)
  );
}

/**
 * @param {object[]} products — current display list (ProductCatalogRow[]),
 *   `price` may be null for items still needing the live-pricing tier.
 * @param {{ priorityItemIds?: number[], storeIdOverride?: number|null }} [options]
 *   priorityItemIds - item_ids to price first (ahead of PRICE_WINDOW's plain
 *   array-order cutoff) — the grid only ever *mounts* cards near the
 *   viewport, but without this the pricing queue was blind to that, so a
 *   long name-search result could spend the whole window pricing off-screen
 *   rows while the ones actually on screen still read "Pricing…". Pass the
 *   ids currently in view (see catalog/page.jsx's rangeChanged wiring).
 *   storeIdOverride - price against THIS store instead of the Redux global
 *   active store. Pricing MUST follow the store actually being browsed
 *   (catalogStoreId) rather than the signed-in one — a price is which
 *   physical piece a store holds (see getLivePricesForItems), so pricing
 *   against the wrong store silently quotes a different piece than the one
 *   on screen. Callers without a filter of their own (RecentlyViewedCarousel,
 *   the customer profile's Wishlist tab) omit this and keep pricing against
 *   the signed-in store.
 * @returns {{
 *   priceById:  Map<number, number>,  // item_id -> live price
 *   settledIds: Set<number>,          // server has given a verdict (priced or not)
 * }}
 *   Callers need both: a card with no price is "Pricing…" until its id is
 *   settled, and "Price unavailable" after.
 */
export function useLiveCatalogPrices(products, { priorityItemIds, storeIdOverride } = {}) {
  // The store decides WHICH physical piece a card is priced against, so a
  // price is only meaningful alongside it. See getLivePricesForItems.
  const activeStoreId = useSelector(selectActiveStoreId);
  const storeId = storeIdOverride ?? activeStoreId;

  const idsNeeding = useMemo(() => {
    const needing = new Set();
    for (const p of products) {
      if (p.price != null || p.item_id == null) continue;
      needing.add(p.item_id);
    }
    if (needing.size === 0) return [];

    // Priority ids (on-screen right now) go first, in their own order, so
    // they win the PRICE_WINDOW cutoff ahead of anything merely earlier in
    // the array. Everything else follows in its existing order.
    const ordered = [];
    if (priorityItemIds?.length) {
      for (const id of priorityItemIds) {
        if (needing.has(id)) { ordered.push(id); needing.delete(id); }
      }
    }
    ordered.push(...needing);

    return ordered.slice(0, PRICE_WINDOW);
  }, [products, priorityItemIds]);

  // Gates the queries below: until the first canary result lands there is no
  // epoch to key against, and fetching now would cache prices under a key
  // that's about to change.
  const { epoch, isBlind } = usePricingEpoch(products, storeId);

  const results = useQueries({
    queries: idsNeeding.map((itemId) => ({
      queryKey: QUERY_KEYS.CATALOG.PRICE(itemId, storeId, epoch),
      queryFn:  () => enqueuePrice(itemId, storeId),
      enabled:  epoch != null,
      // Cached until the epoch says otherwise, never on a timer — the whole
      // point of the epoch. The exception is a BLIND epoch (every canary
      // prices at 0, so it can never signal movement): caching forever on a
      // signal that cannot fire would pin the catalog to stale prices, so
      // that case degrades to a plain time window instead.
      staleTime: isBlind ? BLIND_FALLBACK_STALE : Infinity,
      gcTime:    PRICE_GC_TIME,
      retry:     MAX_ATTEMPTS - 1, // attempts = 1 initial + retries
    })),
  });

  // useQueries hands back a fresh array every render, so derive a cheap
  // signature and rebuild the Map/Set only when a verdict actually changed.
  // The catalog page memoizes on these two identities — rebuilding them
  // every render would bust that memo across the whole grid.
  const signature = results
    .map((r, i) => `${idsNeeding[i]}:${r.status}:${r.data ?? ''}`)
    .join('|');

  return useMemo(() => {
    const priceById  = new Map();
    const settledIds = new Set();

    results.forEach((r, i) => {
      const id = idsNeeding[i];
      if (id == null) return;
      if (r.isSuccess) {
        settledIds.add(id);
        if (r.data != null) priceById.set(id, r.data);
      } else if (r.isError) {
        // Retries exhausted. Previously these stayed out of settledIds and
        // the card read "Pricing…" forever, promising a number that was
        // never coming. An item we've asked about three times and failed to
        // price is unavailable, and should say so.
        settledIds.add(id);
      }
    });

    return { priceById, settledIds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
