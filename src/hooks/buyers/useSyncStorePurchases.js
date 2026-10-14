import { useMutation } from '@tanstack/react-query';

async function syncStorePurchases(companyId) {
  const res = await fetch(`/api/buyers/sync-store/${companyId}`, { method: 'POST' });
  if (!res.ok) throw new Error('Sync failed');
  return res.json();
}

// Backs the /buyers list page's sync-on-load — see
// src/app/api/buyers/sync-store/[companyId]/route.js for what it does
// (every Invoice/Order for one store, pulled from OrnaVerse and upserted).
export function useSyncStorePurchases() {
  const mutation = useMutation({ mutationFn: syncStorePurchases });

  return {
    sync:      mutation.mutateAsync,
    isSyncing: mutation.isPending,
  };
}
