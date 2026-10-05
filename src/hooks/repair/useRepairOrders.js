import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import {
  getRepairOrders,
  getRepairOrderAsIntakeLines,
  getRepairableSoldItems,
  getRepairLocationId,
} from '@/services/repairService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

function normalize(raw) {
  return {
    transactionId: raw.transaction_id,
    documentNo:    raw.document_no,
    documentDate:  raw.document_date,
    partyId:       raw.party_id,
    partyName:     raw.party_name ?? '',
    pieces:        raw.pieces ?? 0,
    weight:        raw.weight ?? 0,
    netAmount:     raw.net_amount ?? 0,
    isPosted:      raw.document_status === 1,
    raw,
  };
}

/**
 * @param {{ partyId?: number|null }} params — omit to list all orders for the store
 */
export function useRepairOrders({ partyId } = {}) {
  const storeId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey: QUERY_KEYS.REPAIR.ORDERS({ storeId, partyId: partyId ?? null }),
    queryFn: async () => {
      const rows = await getRepairOrders({ partyId, company_id: storeId });
      return rows.map(normalize);
    },
    enabled: !!storeId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    orders:    query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}

/**
 * Items this customer bought that can be sent for repair.
 * Uses transaction_type 3 — the repair-specific filter.
 *
 * @param {number|null} partyId
 */
export function useRepairableSoldItems(partyId) {
  const storeId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey: QUERY_KEYS.REPAIR.SOLD_ITEMS({ storeId, partyId: partyId ?? null }),
    queryFn:  () => getRepairableSoldItems({ partyId, companyId: storeId }),
    enabled:  !!partyId && !!storeId,
    staleTime: APP_CONFIG.STALE_TIME.ORDERS,
  });

  return {
    items:     query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}

export function useRepairLocationId() {
  const storeId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey: QUERY_KEYS.REPAIR.LOCATION(storeId),
    queryFn:  () => getRepairLocationId(storeId),
    enabled:  !!storeId,
    staleTime: Infinity,   // stock locations don't change during a shift
  });

  return query.data ?? null;
}

/**
 * Loads one order and projects its lines into Repair In line items.
 * Disabled until an order is actually chosen.
 *
 * @param {number|null} transactionId
 */
export function useRepairOrderIntakeLines(transactionId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.REPAIR.ORDER_DETAIL(transactionId),
    queryFn:  () => getRepairOrderAsIntakeLines(transactionId),
    enabled:  !!transactionId,
  });

  return {
    order:     query.data?.order ?? null,
    lines:     query.data?.lines ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}
