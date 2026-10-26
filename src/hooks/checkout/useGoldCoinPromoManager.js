'use client';

// Centralizes ALL automatic/reactive management of the gold-coin
// "Spend X Get Y Free" promotion — the generic no-longer-applies cleanup,
// the gold coin's own eligibility re-validation, auto-apply, and the
// free-gift quantity auto-discovery — so it runs from exactly ONE place
// (mounted once from AppShell) instead of once per DiscountSection render
// surface. DiscountSection itself is rendered independently, and
// simultaneously mountable, in THREE places: the header's CartDrawer (mini
// cart — mounted on every page, not just while the drawer is open),
// `/cart`, and `/checkout`.
//
// CONFIRMED the real cause (2026-10-22) of "the offer is not applied
// properly and gets removed automatically" reported live, intermittently,
// across the mini cart / cart / checkout: NOT HTTP/query caching (the
// checkout-pricing query already runs with staleTime: 0, and nothing price-
// or promo-related is on queryPersister's IndexedDB allow-list) — it was
// multiple INDEPENDENTLY MOUNTED copies of these effects racing each other.
// Each DiscountSection instance carried its OWN useRef state machine
// (autoAppliedCartKeyRef, freeGiftDiscoveryRef) with zero cross-instance
// coordination, so two mounted instances could each decide "new
// composition, start probing" at the same time, or one could settle the
// shared cart quantity while another — still mid-probe from a moment
// earlier — saw that change and kicked off another round. Moving all of
// this here, and leaving DiscountSection purely presentational (reads
// cart/pricing state to render, calls validatePromo/removePromo only in
// direct response to a user click), fixes it structurally: there is only
// ever one in-flight state machine, no matter how many DiscountSection
// surfaces happen to be visible at once.
import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import { useCart } from '@/hooks/cart/useCart';
import { useCheckoutPricing } from '@/hooks/checkout/useCheckoutPricing';
import { usePromoValidation } from '@/hooks/checkout/usePromoValidation';
import { useActivePromotions } from '@/hooks/checkout/useActivePromotions';
import { getPromoBreakdown } from '@/services/checkoutPricingService';
import { getStockPieces } from '@/services/inventoryService';
import { removePromo as removePromoAction, setFreeGiftQuantity } from '@/store/slices/cartSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { setFreeGiftDiscoveryPromoCode } from '@/store/slices/uiSlice';
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

// Ceiling for the quantity-discovery probe below. In Invoice (real-stock)
// mode, CONFIRMED LIVE 2026-10-08: this must never exceed what
// claimStockPieces (checkoutPricingService.js) can actually claim for a
// single item, or buildPricedLineItems falls short and tips the WHOLE CART
// into Made-to-Order — reproduced live by probing at 100 (a cart whose real
// available stock was >100 but whose claim fallback — see
// claimStockPieces' own per-item re-fetch — defaults to `take: 50`). Fetching
// the stock count the exact same way (no explicit `take` override below)
// keeps this probe's idea of "available" identical to what claiming will
// actually confirm. In Order (made-to-order) mode there is no claim to tip —
// the whole cart is already Order — so this is used directly as the probe
// with no real-stock lookup at all (see the probe branch below). Kept well
// under the Invoice-mode 50 ceiling regardless — real confirmed entitlements
// for this promo have topped out around 12-13 coins (2026-10-08 live
// testing); a smaller probe also means a smaller/cheaper transient request
// on every discovery.
const MAX_FREE_GIFT_PROBE = 25;

export function useGoldCoinPromoManager() {
  const dispatch = useDispatch();
  const activeStoreId = useSelector(selectActiveStoreId);
  const { appliedPromos, isEmpty } = useCart();
  const { invoice, order, isLoading: isPricing } = useCheckoutPricing();
  // Whichever pricing group currently holds priced lines — never both at
  // once (buildPricedLineItems is strictly all-or-nothing; see its own
  // header comment: "Exactly one of invoice/order is non-null... never both
  // at once"). The gold-coin promotion used to be restricted to Invoice
  // (real stock) only; that restriction has been removed by request — the
  // free-gift line is just another cart line and gets routed through
  // whichever path (Invoice or Order/MTO) the rest of the cart takes, so
  // every gold-coin effect below reads from this instead of `invoice`
  // directly.
  const isOrderMode = !invoice?.lineItems?.length && !!order?.lineItems?.length;
  const activeGroup = isOrderMode ? order : invoice;
  const promotionDetails = [
    ...(invoice?.promotionDetails ?? []),
    ...(order?.promotionDetails ?? []),
  ];
  const { validatePromo } = usePromoValidation({ invoice, order });
  const { data: activePromotions = [] } = useActivePromotions();
  const breakdown = getPromoBreakdown(appliedPromos, promotionDetails);

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
  //
  // Checks against the LIVE promotion definition (activePromotions), not the
  // snapshot captured in appliedPromos.promoDetails at apply time — cart
  // state (including that snapshot) is persisted across reloads/sessions per
  // device (see persistConfig's 'cart' whitelist), and this promo's own
  // rules are documented as having rotated 5+ times already. Reported
  // directly (2026-10-10): the exact same product applied cleanly on one
  // device and got removed immediately on another — the only difference was
  // which device still had an older promoDetails snapshot sitting in its
  // persisted cart from before. Falls back to the snapshot only when the
  // live list doesn't have a match yet (e.g. activePromotions still loading).
  useEffect(() => {
    if (isPricing || !activeGroup?.lineItems?.length) return;

    const goldCoinApplied = appliedPromos.find(
      (p) => p.promoDetails?.promotion_type === 6 && p.promoDetails?.free_item_id === GOLD_COIN_FREE_ITEM_ID
    );
    if (!goldCoinApplied) return;

    // Match the EXACT applied promo by its own code first — matching only by
    // type+free_item_id (as this originally did) can silently pick a
    // DIFFERENT gold-coin promo if more than one is active at once (e.g. a
    // rotation window, or a regional/tiered variant), applying the wrong
    // one's eligibility rules to a cart that actually qualifies under the
    // one that's really applied. This was a real regression (2026-10-10).
    const livePromo = activePromotions.find((p) => p.promotion_code === goldCoinApplied.promoCode)
      ?? activePromotions.find((p) => p.promotion_type === 6 && p.free_item_id === GOLD_COIN_FREE_ITEM_ID)
      ?? goldCoinApplied.promoDetails;

    // Every priced row already carries its own item_id (confirmed live
    // 2026-10-12, straight off a real ApplyPromotions response) — matching
    // rows directly by that, instead of correlating cartItems' quantities to
    // lineItems via a cumulative-quantity cursor (as this used to), means
    // this can never drift out of alignment. The cursor approach assumed
    // cartItems' `quantity` always exactly matched how many rows got priced
    // for that line — true at rest, but NOT the instant after this same
    // promo just applied: the free-gift line's quantity is still settling
    // (fresh apply starts at 1, then the discovery effect below corrects it),
    // so a cursor built from the CURRENT cartItems could walk straight past
    // where the bracelet's own rows actually are, reading "ineligible" for a
    // cart that plainly qualifies — removing the promo this same effect is
    // supposed to be protecting, moments after it was applied.
    const eligibleGroupIds = (livePromo?.promotion_details ?? []).map((d) => d.item_group_id);
    const hasEligibleLine = eligibleGroupIds.length === 0 || activeGroup.lineItems.some(
      (r) => r.item_id !== GOLD_COIN_FREE_ITEM_ID && eligibleGroupIds.includes(r.item_group_id)
    );

    const minSpend = Number(livePromo?.minimum_sales_amount) || 0;
    const meetsMinSpend = minSpend <= 0 || activeGroup.totals.netAmount >= minSpend;
    if (hasEligibleLine && meetsMinSpend) return;

    dispatch(removePromoAction(goldCoinApplied.promoCode));
    toast.error(TOAST.CART.PROMO_NO_LONGER_APPLIES(livePromo?.promotion_name ?? goldCoinApplied.promoCode));
  }, [isPricing, activeGroup, appliedPromos, activePromotions, dispatch]);

  // Auto-apply the gold coin promotion — Invoice (real stock) and Order
  // (made-to-order) alike. Previously Invoice-only on the theory that
  // handing out a physical coin against a booking with no stock in hand yet
  // didn't make sense; that restriction has been lifted by request — the
  // free-gift line is priced through the SAME path (Invoice or Order) the
  // rest of the cart resolves to, so there's nothing left stock-specific
  // here. Final eligibility is still OrnaVerse's own ApplyPromotions call
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
    // Cart emptying entirely (neither Invoice nor Order has lines) clears
    // the memory of what was already tried — reported directly (2026-10-07,
    // re-confirmed for Order mode): without this, leaving and returning to
    // the exact same composition never re-applied, since the ref still
    // remembered it as "already attempted" from before it left.
    if (!activeGroup?.lineItems?.length || isEmpty) {
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
      const hasEligibleLine = activeGroup.lineItems.some((li) => eligibleGroupIds.includes(li.item_group_id));
      if (!hasEligibleLine) return;
    }

    const minSpend = Number(goldCoinPromo.minimum_sales_amount) || 0;
    if (minSpend > 0 && activeGroup.totals.netAmount < minSpend) return;

    const cartKey = activeGroup.lineItems.map((li) => `${li.item_id}-${li.sku}`).join('|');
    if (autoAppliedCartKeyRef.current === cartKey) return;
    autoAppliedCartKeyRef.current = cartKey;

    validatePromo(goldCoinPromo.promotion_code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPricing, activeGroup, isEmpty, activePromotions, appliedPromos]);

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
  //   1. PROBE — in Invoice mode, set the free-gift line's quantity to the
  //      real available (unallocated) stock count for that SKU, capped at
  //      MAX_FREE_GIFT_PROBE — NEVER more than what's actually on the shelf,
  //      since requesting more would starve the WHOLE CART into Made-to-
  //      Order (buildPricedLineItems is all-or-nothing; see its own header).
  //      In Order mode the cart is already Made-to-Order and claims no real
  //      stock for any line, so there is nothing to starve — probe straight
  //      at MAX_FREE_GIFT_PROBE with no stock lookup at all.
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
    if (isPricing || !activeGroup?.cartItems?.length) return;

    const goldCoinApplied = appliedPromos.find(
      (p) => p.promoDetails?.promotion_type === 6 && p.promoDetails?.free_item_id === GOLD_COIN_FREE_ITEM_ID
    );
    if (!goldCoinApplied) {
      freeGiftDiscoveryRef.current = { key: null, phase: 'idle', probedQty: null };
      dispatch(setFreeGiftDiscoveryPromoCode(null));
      return;
    }

    const freeGiftIndex = activeGroup.cartItems.findIndex((ci) => ci.freeGiftPromoCode === goldCoinApplied.promoCode);
    if (freeGiftIndex === -1) return;
    const freeGiftItem = activeGroup.cartItems[freeGiftIndex];
    const currentQty = freeGiftItem.quantity ?? 1;

    const qualifyingKey = activeGroup.cartItems
      .filter((ci) => ci.freeGiftPromoCode == null)
      .map((ci) => `${ci.itemId}x${ci.quantity}`)
      .join('|');
    // Other applied promo codes are part of this too — reported directly
    // (2026-10-12): adding a SECOND promotion after the coin had already
    // settled lowers the cart's priced amount without changing which items
    // are in it, so qualifyingKey alone stayed identical and the 'settled'
    // gate below never re-opened — the coin count kept reflecting the
    // pre-discount amount until the operator manually removed and re-applied
    // it. Any OTHER promo being added/removed changes what amount the real
    // entitlement is computed against, so it has to invalidate the settled
    // state the same way a composition change does.
    const otherPromoCodes = appliedPromos
      .filter((p) => p.promoCode !== goldCoinApplied.promoCode)
      .map((p) => p.promoCode)
      .sort()
      .join(',');
    // isOrderMode is part of the key too — the SAME composition's
    // entitlement is DISCOVERED differently depending on which pricing group
    // is active (see the probe branch below), so crossing from Invoice to
    // Order (or back) for the same items must re-probe rather than reuse a
    // settle discovered under the other mode.
    const dedupeKey = `${goldCoinApplied.promoCode}::${qualifyingKey}::${otherPromoCodes}::${isOrderMode ? 'order' : 'invoice'}`;

    // A transient ApplyPromotions failure this pass (confirmed live
    // 2026-10-08, same upstream flakiness as elsewhere this session) leaves
    // lines un-promoted rather than failing the whole basket — see
    // applyPromotionsToLines' own catch. That would read as "nothing is
    // free", which is wrong, not a real entitlement of zero. Only trust
    // freeCount when this promo actually produced a row this round.
    const promoHadEffectThisPass = activeGroup.promotionDetails?.some(
      (row) => row.promotion_code === goldCoinApplied.promoCode
    );
    // OrnaVerse's own warning string ("Free gift covers N pcs. M pcs will be
    // charged.") is the one AUTHORITATIVE statement of the real entitlement —
    // read directly via checkoutPricingService's warnings, not re-derived by
    // guessing from row shapes. That guessing used to live here and broke in
    // two confirmed, mutually-exclusive ways depending on pricing mode:
    // Order/MTO prices every candidate row at net_amount 0 regardless of the
    // true count (so counting "free-looking" rows just counts everything
    // sent); Invoice mode (a real stock claim) can correctly split free vs
    // charged PER ROW on its own, so trimming by a row-count derived from the
    // OTHER mode's behavior silently discarded real, correctly-priced
    // chargeable rows instead (confirmed live 2026-10-26 — a 25-coin probe
    // against an in-stock item: 4 rows at net_amount 0, 21 at their real
    // charged price, and the fix written for Order mode broke this case).
    // Reading the warning directly works identically across both shapes.
    // Falls back to counting net_amount<=0.01 rows only when there's no
    // warning at all — nothing exceeded the entitlement this round, so every
    // candidate row sent IS the real free count, with nothing to disambiguate.
    const warningEntry = activeGroup.warnings?.find((w) => w.promoCode === goldCoinApplied.promoCode);
    const coveredMatch = warningEntry?.message?.match(/covers\s+(\d+)\s*pcs?/i);
    const freeGiftRows = activeGroup.lineItems.filter((r) => r.item_id === GOLD_COIN_FREE_ITEM_ID);
    const freeCountAtCurrentQty = coveredMatch
      ? Number(coveredMatch[1])
      : freeGiftRows
          .filter((r) => (r.net_amount ?? 0) <= 0.01)
          .reduce((sum, r) => sum + (r.pieces > 0 ? r.pieces : 1), 0);

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
      // Reset to a safe baseline of 1 BEFORE the async probe below even
      // starts — not after. Reported directly (2026-10-10): swapping the
      // qualifying product left the line at the PREVIOUS composition's
      // settled quantity (e.g. 12) while this composition's real stock was
      // still unknown; the very next pricing pass (which fires immediately,
      // not after this probe resolves) tried to claim 12 pieces, failed,
      // and tipped the WHOLE cart to Order — removing the promo before the
      // probe ever got a chance to discover the correct number. Quantity 1
      // can essentially always be claimed if the promo has any stock at
      // all, so this keeps every composition change safe to price
      // immediately, the same way a brand-new apply always starts at 1.
      if (currentQty !== 1) {
        dispatch(setFreeGiftQuantity({ promoCode: goldCoinApplied.promoCode, quantity: 1 }));
      }
      (async () => {
        try {
          // An Order (MTO) cart never claims real stock pieces for ANY
          // line — including this one — so there is no "requesting more
          // free coins than exist would tip the whole cart into Order" risk
          // to guard against here (the cart is already in Order mode); probe
          // straight at the ceiling instead of spending a network round trip
          // discovering a real stock count that pricing won't even consult.
          // Invoice mode keeps the original real-stock ceiling exactly as
          // before — no explicit `take` there, since the default (50) is
          // deliberately identical to claimStockPieces' own per-item rescue
          // re-fetch, so "available" can never exceed what claiming will
          // later actually confirm.
          let probeQty;
          if (isOrderMode) {
            probeQty = MAX_FREE_GIFT_PROBE;
          } else {
            const response = await getStockPieces({ itemId: GOLD_COIN_FREE_ITEM_ID, companyId: activeStoreId });
            // Summed by each row's own `pieces` count, not row count — a
            // bulk/commodity stock row (confirmed live 2026-10-26 at a
            // second store: one StockJournal row, one bag, many physical
            // coins) holds several units behind a SINGLE row, the same shape
            // claimStockPieces' own availablePieces helper already accounts
            // for. Counting rows instead of pieces undercounted "available"
            // down to 1 whenever a store's gold-coin stock happened to be
            // held this way — capping the probe (and so the real entitlement)
            // at 1 regardless of true stock or true spend-based eligibility.
            const available = (response?.data?.Entities ?? [])
              .filter((r) => !r.is_allocated)
              .reduce((sum, r) => sum + (r.pieces > 0 ? r.pieces : 1), 0);
            probeQty = Math.min(Math.max(1, available), MAX_FREE_GIFT_PROBE);
          }

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
          console.warn('[useGoldCoinPromoManager] gold coin quantity discovery failed:', err?.serverMessage ?? err?.message);
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
  }, [isPricing, activeGroup, isOrderMode, appliedPromos, activeStoreId, dispatch]);
}
