import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getLivePricesForItems, getCanaryCandidatePool } from '@/services/catalogService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
const MAX_CANARIES = 3;
const EPOCH_CHECK_FLOOR = APP_CONFIG.STALE_TIME.STOCK; // 1 min
const EPOCH_POLL_MS = 3 * 60 * 1000; // 3 min
const NO_EPOCH = 'no-epoch';

// Picks up to MAX_CANARIES items, one per distinct karat, from the stable
// tenant-wide pool (see catalogService.getCanaryCandidatePool's own header
// for why this can't be derived from whatever's currently on screen).
function pickCanaries(pool) {
  const usable = pool.filter((p) => p.item_id != null);
  const withKarat = usable.filter((p) => p.karat_id != null);
  const source = withKarat.length ? withKarat : usable; // already item_id-sorted

  const byKarat = new Map();
  for (const p of source) {
    const karat = p.karat_id ?? 'unknown';
    if (!byKarat.has(karat)) byKarat.set(karat, p.item_id);
    if (byKarat.size >= MAX_CANARIES) break;
  }
  if (!byKarat.size) return null;
  return [...byKarat.values()].sort((a, b) => a - b);
}

function isBlindEpoch(epoch) {
  if (!epoch || epoch === NO_EPOCH) return true;
  return epoch.split('|').every((part) => Number(part.split(':')[1]) === 0);
}

/**
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
export function usePricingEpoch(storeIdOverride) {
  const activeStoreId = useSelector(selectActiveStoreId);
  const storeId = storeIdOverride ?? activeStoreId;
  const queryClient = useQueryClient();

  // Tenant-wide, store-independent, effectively-permanent — every store and
  // every catalog view shares this one fetch, so canary selection (and
  // therefore the epoch) is identical everywhere, not just within one view.
  const { data: canaryPool } = useQuery({
    queryKey: ['catalog', 'canary-pool'],
    queryFn:  getCanaryCandidatePool,
    staleTime: Infinity,
    gcTime:    Infinity,
    retry:     2,
  });

  const canaryIds = useMemo(
    () => (canaryPool ? pickCanaries(canaryPool) : null),
    [canaryPool]
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
      // Must also match storeId (index 3) — otherwise one store's epoch
      // change evicts every OTHER store's still-valid cached prices too.
      predicate: (query) => query.queryKey[3] === storeId && query.queryKey[4] !== epoch,
    });
  }, [epoch, queryClient, storeId]);

  return { epoch, isBlind: isBlindEpoch(epoch) };
}
