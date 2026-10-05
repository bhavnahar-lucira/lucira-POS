import { useQuery }                              from '@tanstack/react-query';
import { getCategories, getSubTypes, getItemGroups } from '@/services/categoryService';
import { QUERY_KEYS }                            from '@/constants/queryKeys';
import APP_CONFIG                                from '@/constants/appConfig';

const selectList = (data) => {
  const result = data?.Entities ?? data?.data ?? [];
  return Array.isArray(result) ? result : [];
};

export function useCategories() {
  return useQuery({
    queryKey:  QUERY_KEYS.CATEGORIES.TYPES(),
    queryFn:   getCategories,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    select:    selectList,
  });
}

export function useSubTypes() {
  return useQuery({
    queryKey:  QUERY_KEYS.CATEGORIES.SUBTYPES(),
    queryFn:   getSubTypes,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    select:    selectList,
  });
}

export function useItemGroups() {
  return useQuery({
    queryKey:  QUERY_KEYS.CATEGORIES.ITEM_GROUPS(),
    queryFn:   getItemGroups,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    select:    selectList,
  });
}
