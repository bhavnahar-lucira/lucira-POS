// src/hooks/catalog/useExactSkuSearch.js
//
// Exact real per-piece SKU lookup — a SEPARATE path from useSkuSearch (an
// item_code TEXT search via Items/List). Confirmed live (2026-09-30):
// Items/List's item_search does not match a physical piece's own SKU at
// all, so a typed real SKU (e.g. "LJ02266943") found nothing via that path
// no matter what. This calls StockJournal/List directly (same call the
// barcode scanner uses), which does resolve it. See catalogService.
// searchByExactSku's own header for the full story.
//
// Kept enabled for the WHOLE search session, same as useCategoryNameSearch
// — an exact match must not disappear once the slow full catalog sweep
// finishes just because that sweep never contained it (see catalog/page.jsx).

import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { searchByExactSku } from '@/services/catalogService';

/**
 * @param {string}      query   - search text (already debounced by the caller)
 * @param {number|null} storeId - active store, used to tag has_stock accurately
 */
export function useExactSkuSearch(query, storeId) {
  return useQuery({
    queryKey: QUERY_KEYS.CATALOG.EXACT_SKU_SEARCH(query, storeId),
    queryFn:  () => searchByExactSku({ sku: query, companyId: storeId }),
    enabled:  !!query && !!storeId,
    staleTime: 0,
  });
}
