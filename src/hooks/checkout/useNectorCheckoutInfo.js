// src/hooks/checkout/useNectorCheckoutInfo.js
// What a customer can ACTUALLY redeem right now, given the cart's real
// payable total — the cart-total-aware counterpart to
// useNectorLoyaltyPoints' plain balance. Nector's own eligibility rules
// (e.g. a real ₹10,000 minimum cart on this tenant) key off `amount`, so
// this is deliberately a separate query from the balance lookup, not a
// derived value — a redemption available on one cart may not be on another
// for the same customer.

import { useQuery } from '@tanstack/react-query';
import { getNectorCheckoutInfo } from '@/services/nectorService';
import { QUERY_KEYS } from '@/constants/queryKeys';

/**
 * @param {string|number|null|undefined} mobile
 * @param {number} amount — the cart/order's current payable total.
 * @param {{ enabled?: boolean }} [options]
 * @returns {{
 *   pointsBalance: number, promotion: object|null, isEligible: boolean,
 *   isFound: boolean, isLoading: boolean, isError: boolean,
 * }}
 *   promotion is the first available redemption (this app claims the full
 *   claimable amount, never a partial one — see CheckoutPaymentSection).
 *   isFound distinguishes "checked, nothing redeemable at this amount" from
 *   "still loading" — NOT the same as "not enrolled" (see
 *   useNectorLoyaltyPoints for that).
 */
export function useNectorCheckoutInfo(mobile, amount, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: QUERY_KEYS.NECTOR.CHECKOUT_INFO(mobile, amount),
    queryFn:  () => getNectorCheckoutInfo({ mobile, amount }),
    enabled:  enabled && !!mobile && amount > 0,
    // Real-time transactional eligibility, not display-only data — never
    // serve a stale "yes redeemable" at the moment staff actually applies it.
    staleTime: 0,
  });

  const promotion = query.data?.promotions?.[0] ?? null;

  return {
    pointsBalance: query.data?.pointsBalance ?? 0,
    promotion,
    isEligible: Boolean(promotion),
    isFound:    query.data?.found ?? false,
    isLoading:  query.isLoading,
    isError:    query.isError,
  };
}
