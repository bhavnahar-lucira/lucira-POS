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
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    select:    normalizeReviewSummary,
  });

  return {
    average:   query.data?.average ?? 0,
    count:     query.data?.count   ?? 0,
    isLoading: query.isLoading,
  };
}
