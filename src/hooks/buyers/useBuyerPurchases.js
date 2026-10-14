import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';

async function fetchPurchases(companyId) {
  const qs = companyId != null ? `?company_id=${companyId}` : '';
  const res = await fetch(`/api/buyers${qs}`);
  if (!res.ok) throw new Error('Failed to load buyers');
  const data = await res.json();
  return data?.purchases ?? [];
}

/**
 * Every raw purchase for a scope — ungrouped, so the /buyers page can apply
 * its date-range/document-type filters against the real data before
 * grouping into buyer rows (see src/lib/buyers/groupPurchasesByBuyer.js).
 * @param {{ companyId?: number }} params — omit for every store (admin only;
 *   the caller decides when to omit this, same trust boundary as the route).
 */
export function useBuyerPurchases({ companyId } = {}) {
  const query = useQuery({
    queryKey: QUERY_KEYS.BUYERS.LIST(companyId ?? 'all'),
    queryFn:  () => fetchPurchases(companyId),
    staleTime: 0,
  });

  return {
    purchases:  query.data ?? [],
    isLoading:  query.isLoading,
    isError:    query.isError,
    refetch:    query.refetch,
  };
}
