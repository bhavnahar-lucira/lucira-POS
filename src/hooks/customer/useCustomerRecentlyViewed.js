// src/hooks/customer/useCustomerRecentlyViewed.js
// Read-only recently-viewed fetch for the customer profile page's Recently
// Viewed tab — deliberately independent of recentlyViewedSlice/
// recentlyViewedMiddleware (which only track whichever customer is
// currently attached to the POS session), since a profile view is often for
// a customer who isn't currently attached. Mirrors useCustomerWishlist.js
// exactly — same Mongo-backed endpoint shape, same party_id/mobile params.

import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';

// Queries by customerMobile alongside party_id — party_id is assigned per
// OrnaVerse tenant (UAT vs LIVE), so a party_id-only lookup can miss history
// saved under a different tenant for the same real customer.
// Same-origin call — the operator's session cookie rides along automatically.
async function fetchRecentlyViewed(partyId, customerMobile) {
  const params = new URLSearchParams();
  if (partyId != null) params.set('party_id', String(partyId));
  if (customerMobile) params.set('customer_mobile', customerMobile);
  const res = await fetch(`/api/customers/recently-viewed?${params.toString()}`);
  if (!res.ok) throw new Error(`Recently viewed fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

/**
 * @param {number|string|null} partyId
 * @param {string|null} [customerMobile] — this profile's own mobile number;
 *   optional for backward compatibility — falls back to party_id-only lookup.
 */
export function useCustomerRecentlyViewed(partyId, customerMobile = null) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const id = partyId ? Number(partyId) : null;

  const query = useQuery({
    queryKey:  QUERY_KEYS.CUSTOMERS.RECENTLY_VIEWED(id),
    queryFn:   () => fetchRecentlyViewed(id, customerMobile),
    enabled:   !!id && isAuthenticated,
    staleTime: 60 * 1000,
  });

  return {
    items:     query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}
