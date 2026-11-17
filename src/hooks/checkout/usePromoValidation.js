import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { listPromotions } from '@/services/promotionService';
import { applyPromotionsToLines } from '@/services/checkoutPricingService';
import { getItemDetail } from '@/services/itemService';
import { getStockPieces } from '@/services/inventoryService';
import { useSelector } from 'react-redux';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { useCart } from '@/hooks/cart/useCart';
import { useSessionTrackingContext } from '@/hooks/analytics/useSessionTrackingContext';
import { isPromotionActive } from '@/lib/normalizers/promotion';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';
import TOAST from '@/constants/toastMessages';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {{ invoice: {lineItems}|null, order: {lineItems}|null }} split —
 */
export function usePromoValidation({ invoice, order }) {
  const { applyPromo, items } = useCart();
  const sessionCtx = useSessionTrackingContext();
  const activeStoreId = useSelector(selectActiveStoreId);

  const mutation = useMutation({
    mutationFn: async (input) => {
      const promoCode = typeof input === 'string' ? input : input.promoCode;
      const overrideAmount = typeof input === 'string' ? null : (input.overrideAmount ?? null);
      const manualEntry = typeof input === 'string' ? false : !!input.manualEntry;

      const response = await listPromotions();
      const entities = response?.data?.Entities ?? [];
      const active   = entities.filter(isPromotionActive);
      const promotion = active.find(
        (p) => p.promotion_code?.toUpperCase() === promoCode.toUpperCase()
      ) ?? null;

      if (!promotion) return { status: 'invalid' };

      // code_required mirrors OrnaVerse's own split: a code_required:false
      // promotion is an "automatic" offer, surfaced only through Available
      // Offers (useActivePromotions already excludes it from there — see its
      // own !p.code_required filter) — OrnaVerse's own Enter Promo silently
      // refuses one (confirmed live 2026-10-07: zero ApplyPromotions calls
      // for a matching code_required:false code, vs. a real attempt+rejection
      // for a code_required:true one). Typed manually here, it isn't a valid
      // promo code for this entry point, so this reports it the same way.
      if (manualEntry && !promotion.code_required) return { status: 'invalid' };
      if (!invoice?.lineItems?.length && !order?.lineItems?.length) {
        return { status: 'not_ready', promotion };
      }

      // Any promotion carrying a free_item_id (confirmed live 2026-10-07:
      // not just promotion_type 6 "Spend X Get Y Free" — type 2 "Free
      // Product" promos use the exact same field, e.g. "Scheme free gift").
      // OrnaVerse's ApplyPromotions 400s with "Free gift items not found in
      // the transaction" unless the free item is ALREADY a line, so there is
      // nothing to preview-check here the normal way — adding it is what
      // makes the promo eligible to try. If it genuinely doesn't qualify
      // (wrong category, spend not met) once it's in, DiscountSection's
      // existing "no longer applies" cleanup (same effect that already
      // handles any promo losing its effect after a re-price) removes both
      // the promo and this free line on the next pricing pass.
      if (promotion.free_item_id != null) {
        const alreadyGifted = items.some(
          (i) => i.itemId === promotion.free_item_id && i.freeGiftPromoCode === promotion.promotion_code
        );
        if (alreadyGifted) return { status: 'eligible', promotion, overrideAmount };

        // Checked before the free line is added: adding it re-prices the whole cart, and a gift line the store
        // can't supply from stock turns an in-stock bill into a Made-to-Order one.
        const name = promotion.promotion_name ?? promotion.promotion_code;
        const minSpend = Number(promotion.minimum_sales_amount) || 0;
        const cartValue = [...(invoice?.lineItems ?? []), ...(order?.lineItems ?? [])]
          .filter((r) => !r.is_gift)
          .reduce((sum, r) => sum + (Number(r.net_amount) || 0), 0);
        if (minSpend > 0 && cartValue < minSpend) {
          return {
            status: 'ineligible', promotion,
            reason: `${name} needs a purchase of at least ${formatAmountOrDash(minSpend)} — this cart is ${formatAmountOrDash(cartValue)}.`,
          };
        }
        if (invoice?.lineItems?.length) {
          const stock = (await getStockPieces({ itemId: promotion.free_item_id, companyId: activeStoreId }))?.data?.Entities ?? [];
          if (!stock.some((r) => !r.is_allocated)) {
            return {
              status: 'ineligible', promotion,
              reason: `${name}: the free item isn't in stock at this store, so it can't be given on an in-stock bill.`,
            };
          }
        }

        const itemResponse = await getItemDetail(promotion.free_item_id);
        const freeItem = itemResponse?.data?.Entity;
        if (!freeItem) return { status: 'ineligible', promotion };

        return {
          status: 'eligible',
          promotion,
          overrideAmount,
          freeGiftItem: {
            itemId:   freeItem.item_id,
            itemCode: freeItem.item_code ?? '',
            itemName: freeItem.item_name ?? 'Free Gift',
            sku:      freeItem.item_code ?? '',
          },
        };
      }

      const candidate = { promoCode: promotion.promotion_code, promoDetails: promotion, overrideAmount };
      const [invoiceResult, orderResult] = await Promise.all([
        invoice?.lineItems?.length
          ? applyPromotionsToLines({ lineItems: invoice.lineItems, appliedPromos: [candidate], documentId: APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE })
          : null,
        order?.lineItems?.length
          ? applyPromotionsToLines({ lineItems: order.lineItems, appliedPromos: [candidate], documentId: APP_CONFIG.DOCUMENT_TYPES.POS_ORDER })
          : null,
      ]);
      const hasEffect = (invoiceResult?.promotionDetails?.length ?? 0) > 0
        || (orderResult?.promotionDetails?.length ?? 0) > 0;

      if (!hasEffect) return { status: 'ineligible', promotion };
      return { status: 'eligible', promotion, overrideAmount };
    },

    onSuccess: (result, variables) => {
      const promoCode = typeof variables === 'string' ? variables : variables.promoCode;
      switch (result.status) {
        case 'invalid':
          toast.error(TOAST.CART.PROMO_INVALID(promoCode));
          tracker.track(EVENTS.PROMO_FAILED, { reason: 'invalid', promoCode, ...sessionCtx });
          return;

        case 'not_ready':
          toast.error(TOAST.CART.PROMO_NOT_READY);
          tracker.track(EVENTS.PROMO_FAILED, {
            reason: 'not_ready', promoCode, promotionCode: result.promotion?.promotion_code, ...sessionCtx,
          });
          return;

        case 'ineligible':
          toast.error(result.reason ?? TOAST.CART.PROMO_NOT_APPLICABLE(result.promotion.promotion_name ?? result.promotion.promotion_code));
          tracker.track(EVENTS.PROMO_FAILED, {
            reason: 'ineligible', promoCode: result.promotion.promotion_code, ...sessionCtx,
          });
          return;

        case 'eligible':
          applyPromo({
            promoCode:      result.promotion.promotion_code,
            promoDetails:   result.promotion,
            overrideAmount: result.overrideAmount ?? null,
            freeGiftItem:   result.freeGiftItem ?? null,
          });
          return;

        default:
          return;
      }
    },

    onError: (error, variables) => {
      const promoCode = typeof variables === 'string' ? variables : variables.promoCode;
      toast.error(TOAST.CART.PROMO_FAILED);
      tracker.track(EVENTS.PROMO_FAILED, {
        reason: 'error', promoCode, error: error?.message ?? 'unknown', ...sessionCtx,
      });
    },
  });

  return {
    validatePromo: mutation.mutate,
    isValidating:  mutation.isPending,
  };
}
