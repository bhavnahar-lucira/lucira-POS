import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
import { getItemDetail } from '@/services/itemService';

export function useProductDetail(itemId) {
  const id = itemId ? parseInt(itemId, 10) : null;

  return useQuery({
    queryKey:  QUERY_KEYS.ITEMS.DETAIL(id),
    queryFn:   () => getItemDetail(id),
    enabled:   !!id,
    staleTime: APP_CONFIG.STALE_TIME.CATALOG,
    select: (response) => {
      const item = response?.data?.Entity ?? null;
      return item && typeof item === 'object' && !Array.isArray(item) ? item : null;
    },
  });
}