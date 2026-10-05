import { useInfiniteQuery } from '@tanstack/react-query';
import { getReviews } from '@/services/nectorService';
import { normalizeReview } from '@/lib/normalizers/review';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

const LIMIT = 10;

/**
 * @param {string|number|null} shopifyProductId — external_product_id
 */
export function useProductReviews(shopifyProductId) {
  const query = useInfiniteQuery({
    queryKey: QUERY_KEYS.REVIEWS.LIST(shopifyProductId),

    queryFn: ({ pageParam = 1 }) =>
      getReviews({ shopifyProductId, page: pageParam, limit: LIMIT }),

    initialPageParam: 1,

    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasNext ? allPages.length + 1 : undefined,

    enabled:   !!shopifyProductId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,

    select: (data) => ({
      reviews:    data.pages.flatMap((page) => page.items.map(normalizeReview)),
      totalCount: data.pages[0]?.count ?? 0,
    }),
  });

  return {
    reviews:         query.data?.reviews ?? [],
    totalCount:      query.data?.totalCount ?? 0,
    isLoading:       query.isLoading,
    isFetchingMore:  query.isFetchingNextPage,
    hasMore:         !!query.hasNextPage,
    loadMore:        query.fetchNextPage,
  };
}
