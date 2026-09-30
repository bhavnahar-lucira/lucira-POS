// src/hooks/products/useClaimableStock.js
//
// The REAL, billable stock count at the active store — distinct from
// useStockByStores' raw piece count, which is what the PDP's own
// availableStock/"In Stock" badge has always used. Confirmed live
// (2026-09-29/30): ProductCatalog/GetStockByStores counts every physical
// piece it has a record of, including ones already reserved by ANOTHER
// transaction (item 64739, LJ-BR0188-14YGLGD-6, at HO: "1 available" while
// its one real StockJournal row already had is_allocated: true) — but ALSO,
// confirmed live 2026-09-30 on item 73512 (Triangle Round Diamond Earrings)
// at HO, pieces GetStockByStores counts that were NEVER given a real
// sellable stock SKU at all: `pieces: 1` there, but StockJournal/List
// (has_sku: true, checkout's own claim source) returned ZERO rows — not one
// allocated row, none at all. Both cases end the same way (checkout books
// it Made to Order), so this hook reports ONE real number — how many are
// actually billable right now — rather than assuming the only possible gap
// is an allocation.
//
// Deliberately a SEPARATE, lazy query (enabled only once the base stock
// count says something's there) rather than replacing useStockByStores
// outright — StockJournal/List is a heavier per-piece call, not worth
// paying on every catalog card the way the cheap aggregate is.

import { useQuery } from '@tanstack/react-query';
import { getStockPieces } from '@/services/inventoryService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {number|null} itemId
 * @param {number|null} companyId
 * @param {{ enabled?: boolean }} [options]
 * @returns {{
 *   claimablePieces: number|null,  // real, billable-today count — null until resolved
 *   isLoading: boolean,
 *   isError: boolean,
 * }}
 */
export function useClaimableStock(itemId, companyId, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: QUERY_KEYS.CATALOG.CLAIMABLE_STOCK(itemId, companyId),
    queryFn:  () => getStockPieces({ itemId, companyId, take: 0 }),
    enabled:  enabled && !!itemId && !!companyId,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
    select: (response) => {
      const rows = response?.data?.Entities ?? [];
      return rows.filter((r) => !r.is_allocated).length;
    },
  });

  return {
    claimablePieces: query.data ?? null,
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}
