import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getStockByStoresBatch } from '@/services/catalogService';
import { selectAvailableStores } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

const DEBOUNCE_MS = 150;

let waiters = new Map(); // itemId -> deferred[]
let timer = null;

function enqueueStock(itemId) {
  return new Promise((resolve, reject) => {
    const existing = waiters.get(itemId);
    if (existing) existing.push({ resolve, reject });
    else waiters.set(itemId, [{ resolve, reject }]);

    if (!timer) timer = setTimeout(flush, DEBOUNCE_MS);
  });
}

async function flush() {
  timer = null;
  const batch = waiters;
  waiters = new Map(); // ids arriving from here on start the next batch
  if (!batch.size) return;

  const ids = [...batch.keys()];
  const settle = (id, fn) => (batch.get(id) ?? []).forEach(fn);

  try {
    const entities = (await getStockByStoresBatch(ids))?.Entities ?? [];
    const rowsByItemId = new Map();
    for (const row of entities) {
      if (!rowsByItemId.has(row.item_id)) rowsByItemId.set(row.item_id, []);
      rowsByItemId.get(row.item_id).push(row);
    }
    for (const id of ids) settle(id, (w) => w.resolve(rowsByItemId.get(id) ?? []));
  } catch (err) {
    for (const id of ids) settle(id, (w) => w.reject(err));
  }
}

/**
 * @param {(number|null|undefined)[]} itemIds
 * @returns {{
 *   stockByItemId: Map<number, { hasStock: boolean, storeCodes: string[] }>,
 *   isLoading: boolean,
 * }}
 *   A requested item_id only resolves once isLoading is false — check that
 *   before treating a missing map entry as "confirmed nowhere in stock"
 *   rather than "haven't checked yet".
 */
export function useCrossStoreStockCodes(itemIds) {
  const availableStores = useSelector(selectAvailableStores);
  const codeByCompanyId = useMemo(
    () => new Map(availableStores.map((s) => [s.company_id, s.company_code])),
    [availableStores]
  );

  const ids = useMemo(
    () => [...new Set((itemIds ?? []).filter((id) => id != null))],
    [itemIds]
  );

  const results = useQueries({
    queries: ids.map((itemId) => ({
      queryKey:  QUERY_KEYS.CATALOG.STOCK_BY_STORES_ITEM(itemId),
      queryFn:   () => enqueueStock(itemId),
      staleTime: APP_CONFIG.STALE_TIME.STOCK,
    })),
  });

  const signature = results
    .map((r, i) => `${ids[i]}:${r.status}:${r.dataUpdatedAt}`)
    .join('|');
  const isLoading = results.some((r) => r.isLoading);

  const stockByItemId = useMemo(() => {
    const result = new Map();
    results.forEach((r, i) => {
      const itemId = ids[i];
      if (itemId == null || r.isLoading) return; // not answered yet — leave unset

      const codes = new Set();
      for (const row of r.data ?? []) {
        if (!(row.pieces > 0)) continue;
        const code = codeByCompanyId.get(row.company_id);
        if (code) codes.add(code);
      }
      result.set(itemId, { hasStock: codes.size > 0, storeCodes: [...codes] });
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, codeByCompanyId]);

  return { stockByItemId, isLoading };
}
