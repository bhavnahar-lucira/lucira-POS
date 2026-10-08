'use client';

import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import { Eye, Tag } from 'lucide-react';
import { useCart } from '@/hooks/cart/useCart';
import { useCheckoutPricing } from '@/hooks/checkout/useCheckoutPricing';
import { usePromoValidation } from '@/hooks/checkout/usePromoValidation';
import { useActivePromotions } from '@/hooks/checkout/useActivePromotions';
import { getPromoBreakdown } from '@/services/checkoutPricingService';
import { getStockPieces } from '@/services/inventoryService';
import { removePromo as removePromoAction, setFreeGiftQuantity } from '@/store/slices/cartSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { setFreeGiftDiscoveryPromoCode } from '@/store/slices/uiSlice';
import PromoCodeInput from '@/components/features/checkout/PromoCodeInput';
import PromoCodeSheet from '@/components/features/checkout/PromoCodeSheet';
import AppliedPromoTag from '@/components/shared/AppliedPromoTag';
import { Button } from '@/components/ui/button';
import TOAST from '@/constants/toastMessages';

// This tenant's real stock item for "0.100 gms 22 kt Gold Coin" (SKU
// LJ-GC0002-916YGPG, confirmed live 2026-10-07) — identifies the gold coin
// promotion by the physical gift item it hands out (promotion_type 6 +
// free_item_id), not by its promotion_code/name. OrnaVerse has already
// rotated through 5+ differently-coded iterations of this same recurring
// offer (P2UA0EGQ, P4EWOWGX, BH9B, ...) — matching on the stable item
// instead of a code means this keeps finding "the gold coin promotion"
// automatically through every future rotation, with nothing to update here.
const GOLD_COIN_FREE_ITEM_ID = 98830;

// Ceiling for the quantity-discovery probe below. CONFIRMED LIVE 2026-10-08:
// this must never exceed what claimStockPieces (checkoutPricingService.js)
// can actually claim for a single item, or buildPricedLineItems falls short,
// tips the WHOLE CART into Made-to-Order, and the Invoice-only effect above
// then strips the promo entirely — reproduced live by probing at 100 (a
// cart whose real available stock was >100 but whose claim fallback — see
// claimStockPieces' own per-item re-fetch — defaults to `take: 50`). Fetching
// the stock count the exact same way (no explicit `take` override below)
// keeps this probe's idea of "available" identical to what claiming will
// actually confirm. Kept well under that 50 ceiling regardless — real
// confirmed entitlements for this promo have topped out around 12-13 coins
// (2026-10-08 live testing); a smaller probe also means a smaller/cheaper
// transient request on every discovery.
const MAX_FREE_GIFT_PROBE = 25;

/**
 * @param {{ compact?: boolean, onViewCart?: () => void }} props
 */
export default function DiscountSection({ compact = false, onViewCart }) {
  const dispatch = useDispatch();
  const activeStoreId = useSelector(selectActiveStoreId);
  const { appliedPromos, removePromo, isEmpty } = useCart();
  const { invoice, order, isLoading: isPricing } = useCheckoutPricing();
  const promotionDetails = [
    ...(invoice?.promotionDetails ?? []),
    ...(order?.promotionDetails ?? []),
  ];
  const { validatePromo, isValidating } = usePromoValidation({ invoice, order });
  const { data: activePromotions = [] } = useActivePromotions();
  const notReadyToCheck = !invoice?.lineItems?.length && !order?.lineItems?.length;
  const disabledHint = isEmpty
    ? 'Add items to your cart before applying a promo code.'
    : 'Still pricing your cart — promo codes can be applied once that’s done.';
  const breakdown = getPromoBreakdown(appliedPromos, promotionDetails);
  const breakdownByCode = new Map(breakdown.map((b) => [b.promoCode, b]));

  useEffect(() => {
    if (isPricing) return;
    breakdown.forEach((b) => {
      if (!b.hasEffect) {
        dispatch(removePromoAction(b.promoCode));
        toast.error(TOAST.CART.PROMO_NO_LONGER_APPLIES(b.promoName));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPricing, promotionDetails]);

  // Enforces the gold coin promotion's Invoice-only rule even when OrnaVerse
  // itself would still accept it. Reported directly (2026-10-07): dropping a
  // line's quantity below what's actually in stock flips the WHOLE cart to
  // one Order (buildPricedLineItems is all-or-nothing, see its own header) —
  // the auto-added gold coin line moves into that Order along with
  // everything else, and OrnaVerse's ApplyPromotions still happily zeroes it
  // there, since nothing about its own eligibility rules cares which
  // document type it lands on. The generic "no longer applies" cleanup above
  // doesn't catch this either, because it never stops having an effect — it
  // just starts having the WRONG one. This is a business rule specific to
  // this one promotion (physical stock isn't in hand yet for an MTO
  // booking), not something OrnaVerse's own data expresses, so it's enforced
  // here rather than left to the generic eligibility cleanup.
  useEffect(() => {
    if (isPricing) return;
    const goldCoinApplied = appliedPromos.find(
      (p) => p.promoDetails?.promotion_type === 6 && p.promoDetails?.free_item_id === GOLD_COIN_FREE_ITEM_ID
    );
    if (!goldCoinApplied || invoice?.lineItems?.length) return;

    dispatch(removePromoAction(goldCoinApplied.promoCode));
    toast.error(TOAST.CART.PROMO_INVOICE_ONLY_REMOVED(goldCoinApplied.promoDetails?.promotion_name ?? goldCoinApplied.promoCode));
  }, [isPricing, invoice, appliedPromos, dispatch]);

  // Re-validates the gold coin promotion's OWN eligibility gates (an
  // eligible item group still present, minimum spend still met) against the
  // CURRENT cart — the auto-apply effect below only ever checks these at the
  // moment it decides whether to apply; nothing re-checked them afterward.
  // Reported directly (2026-10-08): removing the qualifying diamond piece
  // left the coin's promo "intact" — OrnaVerse's ApplyPromotions keeps
  // returning a promotion_details row for the already-discounted free-gift
  // line itself regardless, so the generic "no longer has effect" cleanup's
  // own hasEffect check never goes false and never catches this. The
  // free-gift line is excluded from its own eligibility check below (it's
  // the promo's OWN output, never what qualifies a cart for it).
  useEffect(() => {
    if (isPricing || !invoice?.lineItems?.length) return;

    const goldCoinApplied = appliedPromos.find(
      (p) => p.promoDetails?.promotion_type === 6 && p.promoDetails?.free_item_id === GOLD_COIN_FREE_ITEM_ID
    );
    if (!goldCoinApplied) return;

    const eligibleGroupIds = (goldCoinApplied.promoDetails?.promotion_details ?? []).map((d) => d.item_group_id);
    let cursor = 0;
    let hasEligibleLine = eligibleGroupIds.length === 0;
    for (const ci of invoice.cartItems) {
      const qty = ci.quantity ?? 1;
      if (!hasEligibleLine && ci.freeGiftPromoCode == null) {
        const rows = invoice.lineItems.slice(cursor, cursor + qty);
        if (rows.some((r) => eligibleGroupIds.includes(r.item_group_id))) hasEligibleLine = true;
      }
      cursor += qty;
    }

    const minSpend = Number(goldCoinApplied.promoDetails?.minimum_sales_amount) || 0;
    const meetsMinSpend = minSpend <= 0 || invoice.totals.netAmount >= minSpend;
    if (hasEligibleLine && meetsMinSpend) return;

    dispatch(removePromoAction(goldCoinApplied.promoCode));
    toast.error(TOAST.CART.PROMO_NO_LONGER_APPLIES(goldCoinApplied.promoDetails?.promotion_name ?? goldCoinApplied.promoCode));
  }, [isPricing, invoice, appliedPromos, dispatch]);

  // Auto-apply the gold coin promotion — Invoice (real stock) only, never
  // for an Order (Made to Order): confirmed live stock isn't in hand yet for
  // an MTO booking, so handing out the physical coin doesn't make sense
  // there. Final eligibility is still OrnaVerse's own ApplyPromotions call
  // inside validatePromo — this just finds the promotion and triggers the
  // same flow a manual pick would, skipping it entirely for a cart that
  // obviously can't qualify (wrong category, or net value below the
  // promotion's own `minimum_sales_amount` — confirmed live 2026-10-08: a
  // ₹7,645 Diamond Jewellery cart auto-applied the coin, then OrnaVerse's
  // ApplyPromotions 400'd it with "Minimum Net required is 30000", and it
  // flickered back out) so it doesn't flicker the free coin in and back out
  // on every cart that's merely in the right category but too small.
  const autoAppliedCartKeyRef = useRef(null);
  useEffect(() => {
    if (isPricing) return;
    // Leaving Invoice mode entirely (cart fell back to Order, or emptied)
    // clears the memory of what was already tried — reported directly
    // (2026-10-07): without this, going Invoice → Order → back to the exact
    // same stock pieces never re-applied, since the ref still remembered
    // that cart composition as "already attempted" from before it left.
    if (!invoice?.lineItems?.length) {
      autoAppliedCartKeyRef.current = null;
      return;
    }

    const goldCoinPromo = activePromotions.find(
      (p) => p.promotion_type === 6 && p.free_item_id === GOLD_COIN_FREE_ITEM_ID
    );
    if (!goldCoinPromo) return;
    if (appliedPromos.some((p) => p.promoCode === goldCoinPromo.promotion_code)) return;

    const eligibleGroupIds = (goldCoinPromo.promotion_details ?? []).map((d) => d.item_group_id);
    if (eligibleGroupIds.length > 0) {
      const hasEligibleLine = invoice.lineItems.some((li) => eligibleGroupIds.includes(li.item_group_id));
      if (!hasEligibleLine) return;
    }

    const minSpend = Number(goldCoinPromo.minimum_sales_amount) || 0;
    if (minSpend > 0 && invoice.totals.netAmount < minSpend) return;

    const cartKey = invoice.lineItems.map((li) => `${li.item_id}-${li.sku}`).join('|');
    if (autoAppliedCartKeyRef.current === cartKey) return;
    autoAppliedCartKeyRef.current = cartKey;

    validatePromo(goldCoinPromo.promotion_code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPricing, invoice, activePromotions, appliedPromos]);

  // Auto-aligns the gold coin free-gift line's QUANTITY to what the customer
  // is actually entitled to, instead of leaving it at applyPromo's starting
  // quantity of 1 and making the operator discover the real number by
  // clicking the stepper up by hand. OrnaVerse exposes no ratio/cap for this
  // anywhere in the promotion data (confirmed by a full repo/API search) — a
  // "Spend X Get Y Free" promo's Y is only ever revealed by pricing SOME
  // quantity and seeing how many of those units come back at ₹0 vs full
  // price (ApplyPromotions returns ONE ROW PER PHYSICAL PIECE — see
  // checkoutPricingService.mapPricedLinesToCart's own header). So this is a
  // two-pass discovery, never more:
  //   1. PROBE — set the free-gift line's quantity to the real available
  //      (unallocated) stock count for that SKU, capped at
  //      MAX_FREE_GIFT_PROBE — NEVER more than what's actually on the shelf,
  //      since requesting more would starve the WHOLE CART into Made-to-
  //      Order (buildPricedLineItems is all-or-nothing; see its own header),
  //      which would also trip this file's own Invoice-only removal effect
  //      above for no reason.
  //   2. SETTLE — once that probe's pricing pass resolves, count how many of
  //      ITS OWN per-piece rows came back free and trim the quantity down to
  //      exactly that count. The operator never has to act — they just see
  //      the cart settle on the correct number of free coins.
  // Re-runs on every render where pricing is settled (useCheckoutPricing
  // hands back a brand-new invoice object every call, even when the
  // underlying query data hasn't changed — so "new invoice reference" is not
  // a reliable signal that a NEW pricing pass actually resolved). The
  // dedupeKey + probedQty gate below is what actually protects against
  // re-entrancy; see probedQty's own comment for the race it closes.
  // A manual quantity edit by the operator after settling survives until the
  // qualifying composition next changes, at which point this re-aligns to
  // the new entitlement by design.
  const freeGiftDiscoveryRef = useRef({ key: null, phase: 'idle', probedQty: null });
  useEffect(() => {
    if (isPricing || !invoice?.cartItems?.length) return;

    const goldCoinApplied = appliedPromos.find(
      (p) => p.promoDetails?.promotion_type === 6 && p.promoDetails?.free_item_id === GOLD_COIN_FREE_ITEM_ID
    );
    if (!goldCoinApplied) {
      freeGiftDiscoveryRef.current = { key: null, phase: 'idle', probedQty: null };
      dispatch(setFreeGiftDiscoveryPromoCode(null));
      return;
    }

    const freeGiftIndex = invoice.cartItems.findIndex((ci) => ci.freeGiftPromoCode === goldCoinApplied.promoCode);
    if (freeGiftIndex === -1) return;
    const freeGiftItem = invoice.cartItems[freeGiftIndex];
    const currentQty = freeGiftItem.quantity ?? 1;

    const qualifyingKey = invoice.cartItems
      .filter((ci) => ci.freeGiftPromoCode == null)
      .map((ci) => `${ci.itemId}x${ci.quantity}`)
      .join('|');
    const dedupeKey = `${goldCoinApplied.promoCode}::${qualifyingKey}`;

    // A transient ApplyPromotions failure this pass (confirmed live
    // 2026-10-08, same upstream flakiness as elsewhere this session) leaves
    // lines un-promoted rather than failing the whole basket — see
    // applyPromotionsToLines' own catch. That would read as "nothing is
    // free", which is wrong, not a real entitlement of zero. Only trust
    // freeCount when this promo actually produced a row this round.
    const promoHadEffectThisPass = invoice.promotionDetails?.some(
      (row) => row.promotion_code === goldCoinApplied.promoCode
    );
    // Per-piece slice for the free-gift line, AT currentQty — same
    // cursor-walk mapPricedLinesToCart uses, inlined (that function only
    // returns per-LINE aggregates, which loses exactly the per-unit
    // free/charged split this needs). Valid for currentQty specifically —
    // never read this against any OTHER quantity than the one this exact
    // invoice was priced for.
    let cursor = 0;
    for (let i = 0; i < freeGiftIndex; i += 1) cursor += invoice.cartItems[i].quantity ?? 1;
    const rows = invoice.lineItems.slice(cursor, cursor + currentQty);
    const freeCountAtCurrentQty = rows.filter((r) => (r.net_amount ?? 0) <= 0.01).length;

    const settleAtCurrentQty = () => {
      freeGiftDiscoveryRef.current = { key: dedupeKey, phase: 'settled', probedQty: currentQty };
      dispatch(setFreeGiftDiscoveryPromoCode(null));
      const settledQty = Math.max(1, freeCountAtCurrentQty);
      if (settledQty !== currentQty) {
        dispatch(setFreeGiftQuantity({ promoCode: goldCoinApplied.promoCode, quantity: settledQty }));
      }
    };

    if (freeGiftDiscoveryRef.current.key !== dedupeKey) {
      // New composition — fire the probe. probedQty starts null (we don't
      // know the target until the stock lookup resolves); set below once we
      // do, BEFORE dispatching the quantity change, so the very next render
      // (which will fire while the new pricing pass is still in flight,
      // since invoice/isPricing change identity on every render regardless)
      // already has something to gate against. Flagging "discovering" here,
      // synchronously, means CartItemRow shows the loading state from the
      // very first render of this new composition — never the stale
      // quantity-1 (or previous composition's) number.
      freeGiftDiscoveryRef.current = { key: dedupeKey, phase: 'probing', probedQty: null };
      dispatch(setFreeGiftDiscoveryPromoCode(goldCoinApplied.promoCode));
      (async () => {
        try {
          // No explicit `take` — the default (50) is deliberately identical
          // to claimStockPieces' own per-item rescue re-fetch, so "available"
          // here can never exceed what claiming will later actually confirm.
          const response = await getStockPieces({ itemId: GOLD_COIN_FREE_ITEM_ID, companyId: activeStoreId });
          const available = (response?.data?.Entities ?? []).filter((r) => !r.is_allocated).length;
          const probeQty = Math.min(Math.max(1, available), MAX_FREE_GIFT_PROBE);

          if (probeQty !== currentQty) {
            freeGiftDiscoveryRef.current = { key: dedupeKey, phase: 'probing', probedQty: probeQty };
            dispatch(setFreeGiftQuantity({ promoCode: goldCoinApplied.promoCode, quantity: probeQty }));
            return;
          }
          // CONFIRMED LIVE 2026-10-08: probeQty landing on the SAME value
          // already in the cart (stock itself is the limiting factor, not
          // just a coincidental small quantity) means no dispatch fires here
          // — so nothing would ever trigger a fresh pricing pass for the
          // fallthrough settle logic below to run against. Without settling
          // right here too, the cart was observed stuck at the raw,
          // untrimmed probe quantity indefinitely (reported directly: stuck
          // at 25 when the real entitlement was 12). Settle using the data
          // already captured for this exact quantity — still valid, since
          // nothing has changed between the effect firing and this resolving.
          if (promoHadEffectThisPass) settleAtCurrentQty();
          else freeGiftDiscoveryRef.current = { key: dedupeKey, phase: 'probing', probedQty };
        } catch (err) {
          // Best-effort only — leave the line at whatever quantity it already
          // has rather than blocking checkout over a discovery failure.
          console.warn('[DiscountSection] gold coin quantity discovery failed:', err?.serverMessage ?? err?.message);
          freeGiftDiscoveryRef.current = { key: dedupeKey, phase: 'settled', probedQty: currentQty };
          dispatch(setFreeGiftDiscoveryPromoCode(null));
        }
      })();
      return;
    }

    if (freeGiftDiscoveryRef.current.phase === 'settled') return;

    // CONFIRMED LIVE 2026-10-08: without this gate, a render using the OLD
    // (pre-probe) invoice — which keeps happening because invoice is a new
    // object every render regardless of real data changes — was reaching the
    // settle logic below with STALE per-unit rows (e.g. quantity 1's pricing,
    // all trivially free), settling prematurely, and marking 'settled' before
    // the real probed-quantity pricing pass ever got a chance to run. The
    // probe's own trailing dispatch (to the raw, untrimmed probe quantity)
    // would then land AFTER that premature settle, and — since phase was
    // already 'settled' — nothing ever came back to trim it down. Only ever
    // trust the per-unit split when this render's quantity IS the one we
    // asked the probe for.
    const { probedQty } = freeGiftDiscoveryRef.current;
    if (probedQty == null || currentQty !== probedQty) return;
    if (!promoHadEffectThisPass) return;

    settleAtCurrentQty();
  }, [isPricing, invoice, appliedPromos, activeStoreId, dispatch]);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
        <Tag size={16} className="text-accent shrink-0" aria-hidden="true" />
        Discounts &amp; Offers
      </h2>
      <div className="flex gap-2">
        <PromoCodeSheet
          onApply={validatePromo}
          isApplying={isValidating}
          appliedPromos={appliedPromos}
          triggerClassName="flex-1"
        />
        {compact ? (
          onViewCart && (
            <Button
              type="button"
              variant="outline"
              onClick={onViewCart}
              className="h-auto min-h-9 flex-1 justify-center gap-2 whitespace-normal py-2 text-center text-xs font-semibold leading-tight bg-secondary sm:text-sm"
            >
              <Eye className="size-4 shrink-0" aria-hidden="true" />
              View Details
            </Button>
          )
        ) : (
          <PromoCodeInput
            onApply={(code, overrideAmount) => validatePromo({ promoCode: code, overrideAmount, manualEntry: true })}
            isValidating={isValidating}
            disabled={notReadyToCheck}
            disabledHint={disabledHint}
            triggerClassName="flex-1"
          />
        )}
      </div>

      {appliedPromos.map((promo) => {
        const b = breakdownByCode.get(promo.promoCode);
        const declined = !isPricing && !b?.hasEffect;
        return (
          <div key={promo.promoCode} className="flex flex-col gap-1">
            <AppliedPromoTag
              promoCode={promo.promoCode}
              promoName={promo.promoDetails?.promotion_name}
              discountAmount={b?.amount ?? 0}
              hasEffect={!declined}
              onRemove={() => removePromo(promo.promoCode)}
            />
          </div>
        );
      })}
    </section>
  );
}
