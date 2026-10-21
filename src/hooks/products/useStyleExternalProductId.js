import { useQuery } from '@tanstack/react-query';
import { getDesignVariantsQueued } from '@/services/itemService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useStyleExternalProductId(styleId) {
  const query = useQuery({
    queryKey:  QUERY_KEYS.ITEMS.DESIGN_VARIANTS(styleId),
    queryFn:   () => getDesignVariantsQueued(styleId),
    enabled:   !!styleId,
    // A style's Shopify mapping essentially never changes once set — real
    // master data, not 5-minute-fresh catalog pricing. Matches
    // useAllCatalog's own MASTER_DATA treatment so this also survives a
    // reload via queryPersister.js (see PERSISTED_QUERY_KEY_PREFIXES there),
    // instead of every card re-running this per-card lookup on every visit.
    staleTime: APP_CONFIG.STALE_TIME.MASTER_DATA,
    gcTime:    APP_CONFIG.STALE_TIME.MASTER_DATA,
    select:    (response) => response?.data?.Entity?.external_product_id ?? null,
  });

  return {
    externalProductId: query.data ?? null,
    isLoading: query.isLoading,
  };
}
