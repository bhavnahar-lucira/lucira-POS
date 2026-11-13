import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import {
  listRepairOrders, retrieveRepairOrder,
  listRepairReceipts, retrieveRepairReceipt,
  listRepairInvoices, retrieveRepairInvoice,
  listRepairIns, retrieveRepairIn,
  listRepairOuts, retrieveRepairOut,
  getRepairableSoldItems, getRepairedItemsReadyForBilling,
  resolveRepairLocation, listRepairStockLocations,
  transferRepairOrderToHO, recallRepairOrderTransfer,
  authorizeRepairReceipt, authorizeRepairIn, getBilledRepairOrderIds,
  searchItemMaster, listReturnDestinations, listPendingReturnItems, listCompanyLocations,
} from '@/services/repairService';

const KIND = {
  orders:   { list: listRepairOrders,   retrieve: retrieveRepairOrder },
  receipts: { list: listRepairReceipts, retrieve: retrieveRepairReceipt },
  invoices: { list: listRepairInvoices, retrieve: retrieveRepairInvoice },
  ins:      { list: listRepairIns,      retrieve: retrieveRepairIn },
  outs:     { list: listRepairOuts,     retrieve: retrieveRepairOut },
};

export function useRepairDocuments(kind, { partyId, take = 50 } = {}) {
  const storeId = useSelector(selectActiveStoreId);
  return useQuery({
    queryKey: ['repair', kind, 'list', storeId, partyId ?? null, take],
    queryFn: () => KIND[kind].list({ partyId, take }),
    enabled: !!storeId,
    staleTime: 30_000,
  });
}

export function useBilledRepairOrders(enabled = true) {
  const storeId = useSelector(selectActiveStoreId);
  return useQuery({
    queryKey: ['repair', 'invoices', 'billed-orders', storeId],
    queryFn: getBilledRepairOrderIds,
    enabled: enabled && !!storeId,
    staleTime: 60_000,
  });
}

export function useRepairDocument(kind, id) {
  const storeId = useSelector(selectActiveStoreId);
  return useQuery({
    queryKey: ['repair', kind, 'detail', storeId, id],
    queryFn: () => KIND[kind].retrieve(id),
    enabled: !!storeId && !!id,
    staleTime: 0,
  });
}

export function useRepairableSoldItems(partyId) {
  return useQuery({
    queryKey: ['repair', 'sold-items', partyId],
    queryFn: () => getRepairableSoldItems({ partyId }),
    enabled: !!partyId,
    staleTime: 0,
  });
}

export function useItemMasterSearch(text) {
  const q = text.trim();
  return useQuery({
    queryKey: ['repair', 'item-master', q],
    queryFn: () => searchItemMaster(q),
    enabled: q.length >= 3,
    staleTime: 60_000,
  });
}

export function useReturnDestinations() {
  const storeId = useSelector(selectActiveStoreId);
  return useQuery({
    queryKey: ['repair', 'return-destinations', storeId],
    queryFn: () => listReturnDestinations(storeId),
    enabled: !!storeId,
    staleTime: 10 * 60_000,
  });
}

export function usePendingReturnItems(partyId) {
  return useQuery({
    queryKey: ['repair', 'pending-return', partyId],
    queryFn: () => listPendingReturnItems(partyId),
    enabled: !!partyId,
    staleTime: 0,
  });
}

export function useCompanyLocations(companyId) {
  return useQuery({
    queryKey: ['repair', 'company-locations', companyId],
    queryFn: () => listCompanyLocations(companyId),
    enabled: !!companyId,
    staleTime: 10 * 60_000,
  });
}

export function useRepairedItemsReadyForBilling(partyId) {
  const storeId = useSelector(selectActiveStoreId);
  return useQuery({
    queryKey: ['repair', 'ready-to-bill', storeId, partyId],
    queryFn: () => getRepairedItemsReadyForBilling({ partyId, companyId: storeId }),
    enabled: !!partyId && !!storeId,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useRepairStockLocations(locationType) {
  const storeId = useSelector(selectActiveStoreId);
  return useQuery({
    queryKey: ['repair', 'stock-locations', storeId, locationType],
    queryFn: async () => {
      const repairLocation = await resolveRepairLocation(storeId, locationType);
      return { repairLocation, locations: await listRepairStockLocations(repairLocation) };
    },
    enabled: !!storeId && !!locationType,
    staleTime: 5 * 60_000,
  });
}

function useRepairAction(fn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['repair'] }),
  });
}

export const useTransferRepairOrder = () => useRepairAction(transferRepairOrderToHO);
export const useRecallRepairOrder = () => useRepairAction(recallRepairOrderTransfer);
export const useAuthorizeRepairReceipt = () => useRepairAction(authorizeRepairReceipt);
export const useAuthorizeRepairIn = () => useRepairAction(authorizeRepairIn);
export const useRepairMutation = (fn) => useRepairAction(fn);
