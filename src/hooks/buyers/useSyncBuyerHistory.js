import { useMutation } from '@tanstack/react-query';

async function syncBuyerHistory(customerId) {
  const res = await fetch(`/api/buyers/sync/${customerId}`, { method: 'POST' });
  if (!res.ok) throw new Error('Sync failed');
  return res.json();
}

// Fire-and-check mutation backing the /buyers/[customerId] page's
// auto-sync-on-load — see src/app/api/buyers/sync/[customerId]/route.js for
// what it actually does (GetPartyTransactions → Retrieve each → upsert).
export function useSyncBuyerHistory() {
  const mutation = useMutation({ mutationFn: syncBuyerHistory });

  return {
    sync:      mutation.mutateAsync,
    isSyncing: mutation.isPending,
    isError:   mutation.isError,
  };
}
