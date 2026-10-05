import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getLivePricesForItems } from '@/services/catalogService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { usePricingEpoch } from '@/hooks/catalog/usePricingEpoch';

const DEBOUNCE_MS = 200;
const CHUNK_SIZE  = 8;
const CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;
const PRICE_GC_TIME = 12 * 60 * 60 * 1000; // 12h
const BLIND_FALLBACK_STALE = 60 * 60 * 1000; // 1h
const PRICE_WINDOW = 240;
const buckets = new Map(); // storeId -> { waiters: Map<itemId, deferred[]>, timer }

function getBucket(storeId) {
  let bucket = buckets.get(storeId);
  if (!bucket) {
    bucket = { waiters: new Map(), timer: null };
    buckets.set(storeId, bucket);
  }
  return bucket;
}

function enqueuePrice(itemId, storeId) {
  return new Promise((resolve, reject) => {
    const bucket = getBucket(storeId);
    const existing = bucket.waiters.get(itemId);
    if (existing) existing.push({ resolve, reject });
    else bucket.waiters.set(itemId, [{ resolve, reject }]);
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
            const value = prices.get(id) ?? null;
            settle(id, (w) => w.resolve(value));
          } else {
            settle(id, (w) => w.reject(new Error(`No price verdict for item ${id}`)));
          }
        }
      } catch (err) {
        for (const id of chunk) settle(id, (w) => w.reject(err));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker)
  );
}

/**
 * @param {object[]} products 
 * @param {{ priorityItemIds?: number[], storeIdOverride?: number|null }} [options]
 * @returns {{
 *   priceById:  Map<number, number>,  // item_id -> live price
 *   settledIds: Set<number>,          // server has given a verdict (priced or not)
 * }}
 */
export function useLiveCatalogPrices(products, { priorityItemIds, storeIdOverride } = {}) {
  const activeStoreId = useSelector(selectActiveStoreId);
  const storeId = storeIdOverride ?? activeStoreId;

  const idsNeeding = useMemo(() => {
    const needing = new Set();
    for (const p of products) {
      if (p.price != null || p.item_id == null) continue;
      needing.add(p.item_id);
    }
    if (needing.size === 0) return [];
    const ordered = [];
    if (priorityItemIds?.length) {
      for (const id of priorityItemIds) {
        if (needing.has(id)) { ordered.push(id); needing.delete(id); }
      }
    }
    ordered.push(...needing);

    return ordered.slice(0, PRICE_WINDOW);
  }, [products, priorityItemIds]);
  const { epoch, isBlind } = usePricingEpoch(products, storeId);

  const results = useQueries({
    queries: idsNeeding.map((itemId) => ({
      queryKey: QUERY_KEYS.CATALOG.PRICE(itemId, storeId, epoch),
      queryFn:  () => enqueuePrice(itemId, storeId),
      enabled:  epoch != null,
      staleTime: isBlind ? BLIND_FALLBACK_STALE : Infinity,
      gcTime:    PRICE_GC_TIME,
      retry:     MAX_ATTEMPTS - 1, // attempts = 1 initial + retries
    })),
  });
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
        settledIds.add(id);
      }
    });

    return { priceById, settledIds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
