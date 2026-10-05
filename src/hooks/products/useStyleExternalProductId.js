import { useQuery } from '@tanstack/react-query';
import { getDesignVariantsQueued } from '@/services/itemService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useStyleExternalProductId(styleId) {
  const query = useQuery({
    queryKey:  QUERY_KEYS.ITEMS.DESIGN_VARIANTS(styleId),
    queryFn:   () => getDesignVariantsQueued(styleId),
    enabled:   !!styleId,
    staleTime: APP_CONFIG.STALE_TIME.CATALOG,
    select:    (response) => response?.data?.Entity?.external_product_id ?? null,
  });

  return {
    externalProductId: query.data ?? null,
    isLoading: query.isLoading,
  };
}
