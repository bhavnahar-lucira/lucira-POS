import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import APP_CONFIG from '@/constants/appConfig';
import {
  getCompany, getDestinations, getFreights, listBranchOuts, listBranchIns,
  retrieveBranchOut, retrieveBranchIn, postBranchOut, cancelBranchOut, authorizeBranchIn, listReceiptsBySentTransfer,
} from '@/services/branchTransferService';
import {
  listStockAllocations, retrieveStockAllocation, updateStockAllocation, postStockAllocation, cancelStockAllocation,
} from '@/services/stockAllocationService';
import { getUserData } from '@/services/settingsService';

const KEY = 'branch-transfer';

export function getErrorMessage(error, fallback = 'Something went wrong.') {
  return error?.response?.data?.Error?.Message ?? error?.response?.data?.Message ?? error?.message ?? fallback;
}

export function useMyCompany() {
  const companyId = useSelector(selectActiveStoreId);
  const query = useQuery({
    queryKey: [KEY, 'company', companyId],
    queryFn: () => getCompany(companyId),
    enabled: !!companyId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });
  return { companyId, company: query.data ?? null, isLoading: query.isLoading };
}

export function useDestinations(companyId, ownPartyId) {
  const query = useQuery({
    queryKey: [KEY, 'destinations', companyId, ownPartyId],
    queryFn: () => getDestinations({ companyId, ownPartyId }),
    enabled: !!companyId && !!ownPartyId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });
  return { destinations: query.data ?? [], isLoading: query.isLoading };
}

export function useFreights() {
  const query = useQuery({ queryKey: [KEY, 'freights'], queryFn: getFreights, staleTime: APP_CONFIG.STALE_TIME.STATIC });
  return query.data ?? [];
}

/** OrnaVerse's own permission keys: Edit saves changes, Posting both posts and cancels. */
export function useAllocationPermissions() {
  const query = useQuery({ queryKey: [KEY, 'user-data'], queryFn: getUserData, staleTime: 0 });
  const u = query.data;
  const has = (key) => !!(u?.is_admin || u?.permissions?.[key]);
  return {
    canEdit: has('Inventory:StockAllocation:Edit'),
    canPost: has('Inventory:StockAllocation:Posting'),
    isLoading: query.isLoading,
  };
}

export function useCanPostAllocation() {
  return useAllocationPermissions().canPost;
}

/** Records an action done through the POS (never blocks the action itself). */
export function logTransferEvent(event) {
  fetch('/api/branch-transfer/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }).catch(() => {});
}

/** Allocations cancelled through the POS at the active store (OrnaVerse deletes them on cancel). */
export function useCancelledAllocations() {
  const companyId = useSelector(selectActiveStoreId);
  const query = useQuery({
    queryKey: [KEY, 'events', 'allocation', 'cancelled', companyId],
    queryFn: async () => {
      const res = await fetch('/api/branch-transfer/events?doc_type=allocation&action=cancelled');
      if (!res.ok) throw new Error('Failed to load cancelled allocations');
      return (await res.json()).events ?? [];
    },
    enabled: !!companyId,
    staleTime: 0,
  });
  return query.data ?? [];
}

export function useTransferEvents(docType, ids) {
  const list = (ids ?? []).filter(Boolean);
  const query = useQuery({
    queryKey: [KEY, 'events', docType, list.join(',')],
    queryFn: async () => {
      const res = await fetch(`/api/branch-transfer/events?doc_type=${docType}&transaction_ids=${list.join(',')}`);
      if (!res.ok) throw new Error('Failed to load activity');
      return (await res.json()).events ?? [];
    },
    enabled: list.length > 0,
    staleTime: 0,
  });
  return query.data ?? [];
}

function useDocList(kind, fn) {
  const companyId = useSelector(selectActiveStoreId);
  const query = useQuery({
    queryKey: [KEY, kind, 'list', companyId],
    queryFn: () => fn({ take: APP_CONFIG.PAGINATION.TRANSACTIONS_TAKE }),
    enabled: !!companyId,
    staleTime: 0,
  });
  return { rows: query.data?.rows ?? [], isLoading: query.isLoading, isFetching: query.isFetching, isError: query.isError, refetch: query.refetch };
}

function useDocDetail(kind, id, fn) {
  const query = useQuery({ queryKey: [KEY, kind, 'detail', id], queryFn: () => fn(id), enabled: !!id, staleTime: 0 });
  return { entity: query.data ?? null, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

export const useBranchOuts = () => useDocList('out', listBranchOuts);

export function useSentTransferReceipts() {
  const companyId = useSelector(selectActiveStoreId);
  const query = useQuery({
    queryKey: [KEY, 'out', 'receipts', companyId],
    queryFn: () => listReceiptsBySentTransfer(),
    enabled: !!companyId,
    staleTime: 0,
  });
  return query.data ?? new Map();
}
export const useBranchIns = () => useDocList('in', listBranchIns);

/** Transfers sent to the active store that still need receiving (OrnaVerse lists Branch Ins for the logged-in store only). */
export function usePendingBranchIns() {
  const companyId = useSelector(selectActiveStoreId);
  const query = useQuery({
    queryKey: [KEY, 'in', 'pending', companyId],
    queryFn: async () => (await listBranchIns({ take: 100 })).rows.filter((r) => !r.authorize && r.document_status !== 2),
    enabled: !!companyId,
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });
  return query.data ?? [];
}
export const useStockAllocations = () => useDocList('allocation', listStockAllocations);
export const useBranchOutDetail = (id) => useDocDetail('out', id, retrieveBranchOut);
export const useBranchInDetail = (id) => useDocDetail('in', id, retrieveBranchIn);
export const useStockAllocationDetail = (id) => useDocDetail('allocation', id, retrieveStockAllocation);

function useAction(fn, successMsg, event) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, variables) => {
      const id = typeof variables === 'object' ? variables.id : variables;
      logTransferEvent({ ...event, transaction_id: id, document_no: variables?.documentNo ?? null });
      queryClient.invalidateQueries({ queryKey: [KEY] });
      toast.success(successMsg);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export const usePostBranchOut = () => useAction(({ id }) => postBranchOut(id), 'Transfer posted — it is now in transit to the destination.', { doc_type: 'branch_out', action: 'posted' });
export const useCancelBranchOut = () => useAction(({ id }) => cancelBranchOut(id), 'Transfer cancelled.', { doc_type: 'branch_out', action: 'cancelled' });
export const useAuthorizeBranchIn = () => useAction((payload) => authorizeBranchIn(payload), 'Transfer received and posted.', { doc_type: 'branch_in', action: 'authorised' });
export const usePostAllocation = () => useAction(({ id }) => postStockAllocation(id), 'Stock allocation posted.', { doc_type: 'allocation', action: 'posted' });
export const useCancelAllocation = () => useAction(({ id }) => cancelStockAllocation(id), 'Stock allocation cancelled — the stock is free again.', { doc_type: 'allocation', action: 'cancelled' });
export const useUpdateAllocation = () => useAction(({ id, lines }) => updateStockAllocation({ id, lines }), 'Stock allocation saved.', { doc_type: 'allocation', action: 'updated' });
