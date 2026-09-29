// src/lib/normalizers/promotion.js
// Shared helpers for OrnaVerse CRM.PromotionRow — used by both the
// promo-code picker (checkout) and validation of a manually-typed code.
//
// GetPromotion does NOT filter by code (confirmed 2026-07-15 — it returns
// the same fixed record regardless of input), so every consumer works off
// the full Promotion/List result and filters/matches client-side instead.

/**
 * True when a promotion is currently usable: approved, not disabled, and
 * today falls within its from_date/to_date range.
 * @param {object} promotion — PromotionRow
 * @returns {boolean}
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function isPromotionActive(promotion) {
  if (!promotion?.is_approved || promotion?.is_disabled) return false;

  const now  = Date.now();
  const from = promotion.from_date ? new Date(promotion.from_date).getTime() : -Infinity;
  // to_date is a bare midnight timestamp ("2026-09-28T00:00:00.000") meaning
  // "valid THROUGH that whole calendar day", confirmed against OrnaVerse's
  // own live picker (2026-09-28) — it still showed several "Valid until:
  // 09/28/2026" offers well after midnight that same day. Treating to_date
  // as an exact cutoff instant (the bug here before) wrongly expired every
  // one of those at 00:00:00 instead of end of day — the entire gap between
  // our count and OrnaVerse's (10 vs 15) traced to exactly this.
  const to = promotion.to_date ? new Date(promotion.to_date).getTime() + ONE_DAY_MS - 1 : Infinity;

  return now >= from && now <= to;
}

// NO DISCOUNT CALCULATOR LIVES HERE ANY MORE, deliberately.
//
// This file used to export computePromotionDiscount(promotion, subtotal) —
// percentage of the subtotal, or a flat amount. Captured from OrnaVerse's own
// counter on 2026-08-05, that is wrong for nearly every promotion on this
// tenant: `discount_calc_on` selects which COMPONENT the percentage applies
// to (3 = diamond, 6 = making charges, 1 = whole value), and the server
// re-taxes the line afterwards. "20% Off Diamond" on a ₹1,04,699 piece is 20%
// of its ₹60,888 of diamond — ₹12,177.60, where the old formula said ₹20,939.
//
// The rupee value comes from Helper/ApplyPromotions and nowhere else. See
// promotionService.applyPromotions and checkoutPricingService.
// applyPromotionsToLines. Re-adding a local calculator here would silently
// reintroduce a wrong number into a customer's bill.

/**
 * Short human-readable summary of what a promotion gives — "20% off" or
 * "₹500 off" — for display in the promo picker.
 * @param {object} promotion — PromotionRow
 * @returns {string|null}
 */
export function describePromotionDiscount(promotion) {
  const pct = Number(promotion?.discount_percentage) || 0;
  const amt = Number(promotion?.discount_amount) || 0;
  if (pct > 0) return `${pct}% off`;
  if (amt > 0) return `₹${amt.toLocaleString('en-IN')} off`;
  return null;
}

/**
 * Groups a promotion by discount mechanism — used to decide which promos
 * are "similar" and therefore mutually exclusive at checkout. Multiple
 * promos can be applied at once, but only one 'percentage' promo and only
 * one 'flat' promo can be active simultaneously (same priority order as
 * computePromotionDiscount: percentage wins when both are set).
 * @param {object} promotion — PromotionRow
 * @returns {'percentage'|'flat'}
 */
export function getPromotionDiscountType(promotion) {
  const pct = Number(promotion?.discount_percentage) || 0;
  return pct > 0 ? 'percentage' : 'flat';
}
