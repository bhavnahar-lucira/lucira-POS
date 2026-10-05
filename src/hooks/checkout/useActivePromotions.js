import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
import { listPromotions } from '@/services/promotionService';
import { isPromotionActive } from '@/lib/normalizers/promotion';

export function useActivePromotions() {
  return useQuery({
    queryKey:  QUERY_KEYS.CRM.PROMOTION_LIST(),
    queryFn:   listPromotions,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    select: (response) => {
      const entities = response?.data?.Entities ?? [];
      return entities.filter((p) => isPromotionActive(p) && !p.code_required);
    },
  });
}
