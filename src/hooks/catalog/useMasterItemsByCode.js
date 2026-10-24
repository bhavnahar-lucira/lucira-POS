import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { searchMasterItems } from '@/services/itemService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * Resolves real OrnaVerse master item rows for a small set of exact SKUs
 * that aren't in this store's own (in-stock, store-scoped) catalog cache —
 * the item can still genuinely exist in OrnaVerse, just not assigned/stocked
 * at THIS store. Not scoped to current-store stock, same reasoning as
 * itemService.js's own header comment on searchMasterItems.
 *
 * @param {string[]} skus
 * @returns {Map<string, object>} sku -> master ItemRow
 */
export function useMasterItemsByCode(skus) {
  const uniqueSkus = useMemo(() => [...new Set(skus.filter(Boolean))], [skus]);

  const results = useQueries({
    queries: uniqueSkus.map((sku) => ({
      queryKey: QUERY_KEYS.CATALOG.MASTER_ITEM_BY_CODE(sku),
      queryFn: () => searchMasterItems(sku),
      staleTime: APP_CONFIG.STALE_TIME.MASTER_DATA,
      gcTime: APP_CONFIG.STALE_TIME.MASTER_DATA,
    })),
  });

  return useMemo(() => {
    const map = new Map();
    results.forEach((r, i) => {
      const sku = uniqueSkus[i];
      const row = r.data?.Entities?.find((e) => e.item_code === sku);
      if (row) map.set(sku, normalizeMasterItemRow(row));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.dataUpdatedAt).join('|'), uniqueSkus.join('|')]);
}

// ProductCard reads karat_code (bare number, e.g. "14") — the master Items/List
// row only carries karat_name ("14KT"/"18KT"), so without this a master-
// resolved card shows plain "Gold" instead of "14 Karat Yellow Gold" like
// every native catalog card.
function normalizeMasterItemRow(row) {
  if (row.karat_code || !row.karat_name) return row;
  const karat_code = row.karat_name.match(/\d+/)?.[0] ?? null;
  return karat_code ? { ...row, karat_code } : row;
}
