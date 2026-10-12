import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { listPromotions } from '@/services/promotionService';
import { isPromotionActive } from '@/lib/normalizers/promotion';

export function useActivePromotions() {
  return useQuery({
    queryKey:  QUERY_KEYS.CRM.PROMOTION_LIST(),
    queryFn:   listPromotions,
    // NOT a static 30 min (as this used to be, same category as "categories,
    // payment modes" — but unlike those, this drives whether a promo auto-
    // applies at all). Confirmed live (2026-10-12): OrnaVerse's own promotions
    // rotate (new codes replace old ones, eligibility/minimum-spend changes)
    // — an operator's session open for even part of that 30 minutes keeps
    // checking cart eligibility against a promotion snapshot that's no
    // longer what OrnaVerse will actually honor, and the real apply call
    // then legitimately rejects it. Same reasoning as useCheckoutPricing's
    // own staleTime: this must always reflect live state.
    staleTime: 0,
    select: (response) => {
      const entities = response?.data?.Entities ?? [];
      return entities.filter((p) => isPromotionActive(p) && !p.code_required);
    },
  });
}
