import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { listReserves, retrieveReserve } from '@/services/reserveService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { mapWithConcurrency } from '@/lib/mapWithConcurrency';

const POSTED = 1;

/** Pieces held by the active store's open reserves: [{ item_id, item_code, sku, party_id, party_name, mobile, document_no, document_date }]. */
async function fetchHeldPieces(companyId) {
  const open = (await listReserves({ companyId })).filter((r) => r.document_status === POSTED).slice(0, 100);
  const full = await mapWithConcurrency(open, (r) => retrieveReserve(r.transaction_id).catch(() => null));
  return full.filter(Boolean).flatMap((r) => (r.line_items ?? []).map((l) => ({
    item_id: l.item_id,
    item_code: l.item_code,
    sku: l.sku,
    party_id: r.party_id,
    party_name: r.party_name,
    mobile: r.mobile,
    document_no: r.document_no,
    document_date: r.document_date,
  })));
}

export function useHeldReserves() {
  const companyId = useSelector(selectActiveStoreId);
  const { data = [] } = useQuery({
    queryKey: ['reserves', 'held', companyId],
    queryFn: () => fetchHeldPieces(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return data;
}

/** Held pieces for one product (matched by item_id, falling back to design code). */
export function useHeldFor(itemId, itemCode) {
  const held = useHeldReserves();
  if (!itemId && !itemCode) return [];
  return held.filter((h) => (itemId && h.item_id === itemId) || (!h.item_id && itemCode && h.item_code === itemCode));
}
