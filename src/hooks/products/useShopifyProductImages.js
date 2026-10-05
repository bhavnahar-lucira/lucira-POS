import { useQuery }                 from '@tanstack/react-query';
import { getShopifyProductMedia }   from '@/services/shopifyService';
import { QUERY_KEYS }               from '@/constants/queryKeys';
import APP_CONFIG                   from '@/constants/appConfig';

const STALE_TIME = APP_CONFIG.STALE_TIME.MASTER_DATA;

/**
 * @param {string|number|null|undefined} externalProductId
 *   Shopify product ID from OrnaVerse Style/Retrieve → Entity.external_product_id
 *
 * @returns {{
 *   images:       Array<{ id, src, alt, width, height, position }>,
 *   videos:       Array<{ id, src, poster, alt, position }>,
 *   primaryImage: { id, src, alt, width, height, position } | null,
 *   description:  string | null,
 *   isLoading:    boolean,
 *   isError:      boolean,
 *   hasImages:    boolean,
 *   hasVideos:    boolean,
 * }}
 */
export function useShopifyProductImages(externalProductId) {
  const id = externalProductId ?? null;

  const query = useQuery({
    queryKey: QUERY_KEYS.SHOPIFY.PRODUCT_IMAGES(id),
    queryFn:  () => getShopifyProductMedia(id),
    enabled:  !!id,
    staleTime: STALE_TIME,
    gcTime:    STALE_TIME,
    // getShopifyProductMedia never throws (returns empty arrays on error),
    // so isError is exposed for completeness only.
  });

  const images = (query.data?.images ?? []).slice().sort((a, b) => a.position - b.position);
  const videos = (query.data?.videos ?? []).slice().sort((a, b) => a.position - b.position);

  return {
    images,
    videos,
    primaryImage: images[0] ?? null,
    description:  query.data?.description ?? null,
    isLoading:    query.isLoading,
    isError:      query.isError,
    hasImages:    images.length > 0,
    hasVideos:    videos.length > 0,
  };
}
