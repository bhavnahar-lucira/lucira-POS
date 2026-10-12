import { useQuery } from '@tanstack/react-query';
import { retrieveCustomer } from '@/services/customerService';
import { normalizeCustomer } from '@/lib/normalizers/customer';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { useSelector } from 'react-redux';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useRetrieveCustomer(partyId, { enabled = true } = {}) {
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const query = useQuery({
    queryKey: QUERY_KEYS.CUSTOMERS.RETRIEVE(partyId),
    queryFn:  async () => {
      const response = await retrieveCustomer(partyId);
      const entity   = response?.data?.Entity ?? null;
      return entity ? normalizeCustomer(entity) : null;
    },
    enabled:   enabled && isAuthenticated && !!partyId,
    // NOT a static 5 min (as this used to be) — same category of bug as
    // useCheckoutPricing/useActivePromotions, confirmed live (2026-10-12):
    // CheckoutPanCapture's full-entity merge (see its own effectiveRaw)
    // builds from whatever this query returns. If that's a snapshot from
    // BEFORE the PAN document was uploaded elsewhere (a different screen,
    // an earlier page visit — anything outside this exact component
    // instance's own in-session save tracking), saving just the PAN NUMBER
    // re-sends that stale snapshot's missing pan_document right back to
    // OrnaVerse, silently erasing a document that was already genuinely on
    // file — then Invoice/Create rejects with "Please upload PAN & its
    // number" despite the operator having uploaded it correctly earlier.
    // A customer's own compliance fields must always reflect live state.
    staleTime: 0,
  });

  return {
    customer:  query.data    ?? null,
    isLoading: query.isLoading,
    isFetching:query.isFetching,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}