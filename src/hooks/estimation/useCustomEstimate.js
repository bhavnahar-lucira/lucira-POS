import { useQuery } from '@tanstack/react-query';
import {
  getCustomEstimateItems, getItemSizesByType, getStoneTypeDetails,
} from '@/services/customEstimateService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/** Catalog items flagged allow_custom_estimation — confirmed just 1 on this tenant. */
export function useCustomEstimateItems() {
  const query = useQuery({
    queryKey:  QUERY_KEYS.ITEMS.CUSTOM_ESTIMATE_LIST(),
    queryFn:   getCustomEstimateItems,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}

/** Item sizes scoped to the chosen item's own type_id. */
export function useItemSizesByType(typeId) {
  const query = useQuery({
    queryKey:  QUERY_KEYS.CUSTOM.SIZES(typeId),
    queryFn:   () => getItemSizesByType(typeId),
    enabled:   !!typeId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });
  return { sizes: query.data ?? [], isLoading: query.isLoading };
}

/** "Type" dropdown for the Diamonds/stones table, scoped to the chosen Item Group. */
export function useStoneTypeDetails(itemGroupId) {
  const query = useQuery({
    queryKey:  QUERY_KEYS.CUSTOM.TYPEDETAILS(itemGroupId),
    queryFn:   () => getStoneTypeDetails(itemGroupId),
    enabled:   !!itemGroupId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });
  return { types: query.data ?? [], isLoading: query.isLoading };
}
