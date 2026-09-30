import { useDispatch, useSelector } from 'react-redux';
import { useCallback } from 'react';

import {
  setActiveStore,
  clearStore,
  selectActiveStoreId,
  selectActiveStoreName,
  selectActiveStoreCode,
  selectAvailableStores,
} from '@/store/slices/storeSlice';
import queryClient from '@/lib/queryClient';
import { switchCompany } from '@/services/storeService';

/**
 * useActiveStore — provides active store context and store switching action.
 *
 * Provides:
 *   - activeStoreId: number | null
 *   - activeStoreName: string | null
 *   - activeStoreCode: string | null
 *   - availableStores: Store[]
 *   - switchStore(store): sets a new active store in Redux
 *   - clearActiveStore(): clears store context
 */
export function useActiveStore() {
  const dispatch = useDispatch();

  const activeStoreId = useSelector(selectActiveStoreId);
  const activeStoreName = useSelector(selectActiveStoreName);
  const activeStoreCode = useSelector(selectActiveStoreCode);
  const availableStores = useSelector(selectAvailableStores);

  /**
   * Switches the active store context.
   *
   * Invalidates the TanStack Query cache here rather than leaving it to the
   * caller — the previous contract ("handled by the component initiating
   * the switch") was never actually honored by StoreSelectionGrid, the only
   * real caller, so every store-scoped query not keyed by store id (schemes
   * list, payment modes, sales persons, financial year/document config, ...)
   * kept serving the PREVIOUS store's cached data after a switch. Doing it
   * here means it can't be forgotten by a future caller either.
   *
   * FIXED 2026-09-23 (reported: "switching stores takes a lot of time") —
   * this used to be queryClient.clear(), which wipes EVERYTHING, including
   * caches explicitly confirmed store-agnostic: the shared tenant-wide
   * catalog sweep (useAllCatalog — current_company_id doesn't even scope
   * that endpoint, the exact same ~2,699-item pool comes back regardless of
   * store, see catalogService's own header) and Shopify product images.
   * Throwing those away on every switch forced a full ~15-20s re-sweep
   * purely because the operator picked a different store, even though nothing
   * about that data had actually changed. invalidateQueries with a predicate
   * keeps the original safety guarantee (anything NOT explicitly excluded
   * still gets invalidated, so a future store-scoped-but-unkeyed query still
   * can't slip through) while sparing the two caches already proven safe to
   * keep. It also only forces an immediate refetch for ACTIVE queries;
   * inactive ones are marked stale and refetch on next use, same as any
   * normal invalidation — clear() forced every one of them to reload right
   * now, active or not.
   *
   * Also switches OrnaVerse's own SESSION company (storeService.switchCompany)
   * before touching local state — confirmed live 2026-09-15 that several
   * endpoints (Order/List, Invoice/List, the InterstoreReturn workflow)
   * scope themselves to the session's company, not to whatever `company_id`
   * an individual request sends. Every caller of this function goes through
   * one place, so no future call site can forget to keep the two in sync.
   * Awaited and allowed to throw — a caller that can't confirm the switch
   * on OrnaVerse's side should not proceed as if it succeeded.
   *
   * `refetchType: 'none'` (reported directly, 2026-09-30, both "from the
   * header" and "on catalog" — this was the header path): every caller of
   * switchStore immediately navigates away or re-renders into a whole new
   * store context right after, so the page that's still mounted at the
   * moment of the switch is on its way out. Without this, invalidateQueries'
   * default 'active' refetch was live-confirmed to burst-refetch that
   * OUTGOING page's entire store-scoped query set (catalog list, stock,
   * pricing, per-item style/review lookups) right as it's being unmounted —
   * pure wasted network competing with the next page's own load. Marking
   * everything stale without eagerly refetching is still fully correct: the
   * next page's queries are new mounts anyway and fetch fresh regardless of
   * staleness.
   * @param {{ company_id, company_name, store_code }} store
   */
  const switchStore = useCallback(async (store) => {
    await switchCompany(store.company_id);
    queryClient.invalidateQueries({
      refetchType: 'none',
      predicate: (query) => {
        const key = query.queryKey;
        // The two confirmed store-agnostic caches — see this function's own
        // comment above for why these specifically are safe to keep.
        if (key[0] === 'catalog' && key[1] === 'all' && key[2] === 'shared') return false;
        if (key[0] === 'shopify') return false;
        return true;
      },
    });
    dispatch(
      setActiveStore({
        storeId: store.company_id,
        storeName: store.mailing_name,
        storeCode: store.company_code ?? null,
      })
    );
  }, [dispatch]);

  const clearActiveStore = useCallback(() => {
    dispatch(clearStore());
  }, [dispatch]);

  return {
    activeStoreId,
    activeStoreName,
    activeStoreCode,
    availableStores,
    switchStore,
    clearActiveStore,
  };
}