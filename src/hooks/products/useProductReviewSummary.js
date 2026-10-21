import { useQuery } from '@tanstack/react-query';
import { getReviewSummaryQueued } from '@/services/nectorService';
import { normalizeReviewSummary } from '@/lib/normalizers/review';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {string|number|null} shopifyProductId — external_product_id
 */
export function useProductReviewSummary(shopifyProductId) {
  const query = useQuery({
    queryKey:  QUERY_KEYS.REVIEWS.SUMMARY(shopifyProductId),
    queryFn:   () => getReviewSummaryQueued(shopifyProductId),
    enabled:   !!shopifyProductId,
    // Rating averages move slowly (days, not minutes) — treated as master
    // data so this also persists across a reload via queryPersister.js
    // (see PERSISTED_QUERY_KEY_PREFIXES there), same reasoning as
    // useStyleExternalProductId's identical change.
    staleTime: APP_CONFIG.STALE_TIME.MASTER_DATA,
    gcTime:    APP_CONFIG.STALE_TIME.MASTER_DATA,
    select:    normalizeReviewSummary,
  });

  return {
    average:   query.data?.average ?? 0,
    count:     query.data?.count   ?? 0,
    isLoading: query.isLoading,
  };
}
