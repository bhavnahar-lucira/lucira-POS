import { useQuery } from '@tanstack/react-query';
import { getProducts } from '@/services/catalogService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {number[]}    typeIds  - category type_ids the current search query matched
 * @param {number|null} storeId  - current_company_id to scope results to
 * @param {boolean}     enabled  - caller gates this (only while the full index isn't ready)
 */
export function useCategoryNameSearch(typeIds, storeId, enabled) {
  const hasTypeIds = typeIds.length > 0;

  return useQuery({
    queryKey: QUERY_KEYS.CATALOG.CATEGORY_SEARCH(typeIds, storeId),
    queryFn: ({ signal }) => getProducts({
      current_company_id: storeId,
      Take:               APP_CONFIG.PAGINATION.CATALOG_TAKE,
      Skip:                0,
      show_out_of_stock:   true,
      type_ids:            typeIds,
    }, signal),
    select:    (data) => data?.Entities ?? [],
    enabled:   enabled && hasTypeIds && !!storeId,
    staleTime: 0, // always fresh — this is the fast/live interim path
  });
}
