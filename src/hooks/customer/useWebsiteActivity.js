import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';

async function fetchWebsiteActivity(partyId, customerMobile, customerEmail) {
  const params = new URLSearchParams();
  if (customerMobile) params.set('customer_mobile', customerMobile);
  if (customerEmail)  params.set('customer_email', customerEmail);
  const res = await fetch(`/api/customers/website-activity?${params.toString()}`);
  if (!res.ok) throw new Error(`Website activity fetch failed: ${res.status}`);
  return res.json();
}

/**
 * @param {number|string|null} partyId
 * @param {string|null} [customerMobile]
 * @param {string|null} [customerEmail]
 */
export function useWebsiteActivity(partyId, customerMobile = null, customerEmail = null) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const id = partyId ? Number(partyId) : null;

  const query = useQuery({
    queryKey:  QUERY_KEYS.CUSTOMERS.WEBSITE_ACTIVITY(id),
    queryFn:   () => fetchWebsiteActivity(id, customerMobile, customerEmail),
    enabled:   !!id && isAuthenticated && !!(customerMobile || customerEmail),
    staleTime: 60 * 1000,
  });

  return {
    wishlist:       query.data?.wishlist ?? [],
    cart:           query.data?.cart ?? [],
    abandonedCart:  query.data?.abandonedCart ?? [],
    recentlyViewed: query.data?.recentlyViewed ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}
