import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getLivePricesForItems } from '@/services/catalogService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
const MAX_CANARIES = 3;
const EPOCH_CHECK_FLOOR = APP_CONFIG.STALE_TIME.STOCK; // 1 min
const EPOCH_POLL_MS = 3 * 60 * 1000; // 3 min
const NO_EPOCH = 'no-epoch';
const canaryByStore = new Map(); // storeId -> number[]

function freezeCanaries(storeId, products) {
  if (storeId == null) return null;
  const existing = canaryByStore.get(storeId);
  if (existing) return existing;
  if (!products?.length) return null; // still loading — try again next render

  const usable = products.filter((p) => p.item_id != null);
  const withKarat = usable.filter((p) => p.karat_id != null);
  const pool = withKarat.length ? withKarat : usable;
  const ranked = [...pool].sort((a, b) =>
    (b.has_stock ? 1 : 0) - (a.has_stock ? 1 : 0) || a.item_id - b.item_id
  );

  const byKarat = new Map();
  for (const p of ranked) {
    const karat = p.karat_id ?? 'unknown';
    if (!byKarat.has(karat)) byKarat.set(karat, p.item_id);
    if (byKarat.size >= MAX_CANARIES) break;
  }
  if (!byKarat.size) return null;

  const ids = [...byKarat.values()].sort((a, b) => a - b);
  canaryByStore.set(storeId, ids);
  return ids;
}

function isBlindEpoch(epoch) {
  if (!epoch || epoch === NO_EPOCH) return true;
  return epoch.split('|').every((part) => Number(part.split(':')[1]) === 0);
}

/**
 * @param {object[]} products — current display list, used once per store to
 *   choose the canaries. Later changes to it are ignored on purpose.
 * @param {number|null} [storeIdOverride] — prices the canaries against THIS
 *   store instead of the Redux global active store — see useLiveCatalogPrices
 *   for why this must follow the store actually being browsed.
 * @returns {{ epoch: string|undefined, isBlind: boolean }}
 *   `epoch` is undefined until the first canary result lands — callers MUST
 *   NOT fetch prices before then, or those prices would be cached under a key
 *   that is about to change and be refetched immediately.
 *   `isBlind` means the epoch cannot detect change and must not be trusted as
 *   a licence to cache indefinitely.
 */
export function usePricingEpoch(products, storeIdOverride) {
  const activeStoreId = useSelector(selectActiveStoreId);
  const storeId = storeIdOverride ?? activeStoreId;
  const queryClient = useQueryClient();

  const canaryIds = useMemo(
    () => freezeCanaries(storeId, products),
    [storeId, products]
  );

  const { data, isError } = useQuery({
    queryKey: QUERY_KEYS.CATALOG.PRICE_EPOCH(storeId, canaryIds ?? []),
    queryFn: async () => {
      const { prices, answered } = await getLivePricesForItems(canaryIds, storeId);
      const missing = canaryIds.filter((id) => !answered.has(id));
      if (missing.length) {
        throw new Error(`canary re-price reached no verdict for ${missing.join(', ')}`);
      }
      return canaryIds.map((id) => `${id}:${prices.get(id) ?? 0}`).join('|');
    },
    enabled:   Boolean(storeId && canaryIds?.length),
    staleTime: EPOCH_CHECK_FLOOR,
    refetchInterval: EPOCH_POLL_MS,
    gcTime:    Infinity, // losing the epoch would strand every price cached under it
    retry:     2,
  });

  const epoch = data ?? (isError ? NO_EPOCH : undefined);
  useEffect(() => {
    if (!epoch) return;
    queryClient.removeQueries({
      queryKey: ['catalog', 'price'],
      predicate: (query) => query.queryKey[4] !== epoch,
    });
  }, [epoch, queryClient]);

  return { epoch, isBlind: isBlindEpoch(epoch) };
}
