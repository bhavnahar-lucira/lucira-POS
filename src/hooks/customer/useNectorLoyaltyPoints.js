import { useQuery } from '@tanstack/react-query';
import { getCustomerLoyalty } from '@/services/nectorService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {string|number|null|undefined} mobile — real, unmasked mobile number.
 * @param {{ enabled?: boolean }} [options]
 * @returns {{
 *   points: number, tier: string|null, name: string|null,
 *   isFound: boolean, isLoading: boolean, isError: boolean,
 * }}
 *   isFound distinguishes "no Nector lead" from "still loading", so a caller
 *   can show "Not enrolled" instead of a misleading 0.
 */
export function useNectorLoyaltyPoints(mobile, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: QUERY_KEYS.NECTOR.LOYALTY(mobile),
    queryFn:  () => getCustomerLoyalty(mobile),
    enabled:  enabled && !!mobile,
    staleTime: APP_CONFIG.STALE_TIME.CUSTOMER,
  });

  return {
    points:    query.data?.points ?? 0,
    tier:      query.data?.tier ?? null,
    name:      query.data?.name ?? null,
    isFound:   query.data?.found ?? false,
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}
