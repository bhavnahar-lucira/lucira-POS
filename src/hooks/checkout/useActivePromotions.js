// src/hooks/checkout/useActivePromotions.js
// Currently-BROWSABLE promotions for the "Available Offers" ticket list
// (PromoCodeSheet) specifically — not every currently-usable promotion.
// Filters the full Promotion/List result down to ones that are approved,
// not disabled, within their date range today, AND don't require a code —
// confirmed live (2026-09-28) that `code_required` has zero effect on
// Helper/ApplyPromotions itself (a code_required:true promotion applies
// exactly like any other once you already know its code) — it's purely a
// discovery/display flag. A code_required:true promotion must stay
// discoverable ONLY by typing its exact code into PromoCodeInput, never by
// browsing this ticket list — see usePromoValidation.js, which deliberately
// does NOT apply this same code_required filter (it matches by exact code
// against the full active list, code_required or not).

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
