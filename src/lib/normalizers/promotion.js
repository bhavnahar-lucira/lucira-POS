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
  const to = promotion.to_date ? new Date(promotion.to_date).getTime() + ONE_DAY_MS - 1 : Infinity;

  return now >= from && now <= to;
}

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
 * Groups a promotion by discount mechanism — descriptive only (analytics
 * tagging, analyticsMiddleware.js). NOT a stacking/exclusivity rule — this
 * app used to block a second 'percentage' promo from applying alongside a
 * first one, which turned out to be invented, not real: OrnaVerse's own POS
 * applies multiple percentage promos on the same bill without issue (see
 * usePromoValidation's own header for what actually governs stacking —
 * each promotion's own `exclude_policy`, enforced server-side).
 * @param {object} promotion — PromotionRow
 * @returns {'percentage'|'flat'}
 */
export function getPromotionDiscountType(promotion) {
  const pct = Number(promotion?.discount_percentage) || 0;
  return pct > 0 ? 'percentage' : 'flat';
}

/** promotion_type — Promo Type dropdown, options 1-10 in this exact order. */
export const PROMOTION_TYPE_LABELS = {
  1: 'Discount',
  2: 'Free Product',
  3: 'Gift Voucher',
  4: 'Gift Coupon',
  5: 'Buy X Get Y at Discount',
  6: 'Spend X Get Y Free',
  7: 'Spend X Get Y Discount',
  8: 'Round Off',
  9: 'Scheme Discount',
  10: 'Employee / Corporate',
};

/** promotion_scope — Scope dropdown. */
export const PROMOTION_SCOPE_LABELS = {
  0: 'Regular',
  1: 'Seasonal',
  2: 'Customer-specific',
};

/** applicable_on — Applicable On dropdown (what the promo's own top-level
 * discount targets; promotion_details[] rows narrow this further per item/
 * category/karat/etc when present — see hasScopedEligibility below). */
export const APPLICABLE_ON_LABELS = {
  0: 'Whole bill',
  1: 'Specific products',
  2: 'Making charges',
  3: 'Diamond/stone value',
};

/** discount_calc_on — Calculate On dropdown (which component a %/amount
 * discount is actually measured against — see promotionService.applyPromotions
 * for why this can never be computed client-side). */
export const DISCOUNT_CALC_ON_LABELS = {
  1: 'Subtotal',
  2: 'Metal value',
  3: 'Diamond value',
  4: 'Colour stone value',
  5: 'Stone value',
  6: 'Making charges',
  7: 'Other value',
  8: 'Net value',
  9: 'Making charges (component)',
  10: 'Gold-to-diamond ratio',
  11: 'Inventory age',
  12: 'Taxable amount',
};

/** discount_on — Discount On dropdown (HOW the discount is expressed, not
 * what it's measured against — a separate axis from discount_calc_on). */
export const DISCOUNT_ON_LABELS = {
  1: 'Fixed amount',
  2: 'Percentage',
  3: '% with a max amount cap',
  4: 'Rate-based',
};

const label = (map, value) => map[value] ?? null;

export const getPromotionTypeLabel   = (p) => label(PROMOTION_TYPE_LABELS, p?.promotion_type) ?? 'Offer';
export const getPromotionScopeLabel  = (p) => label(PROMOTION_SCOPE_LABELS, p?.promotion_scope);
export const getApplicableOnLabel    = (p) => label(APPLICABLE_ON_LABELS, p?.applicable_on);
export const getDiscountCalcOnLabel  = (p) => label(DISCOUNT_CALC_ON_LABELS, p?.discount_calc_on);
export const getDiscountOnLabel      = (p) => label(DISCOUNT_ON_LABELS, p?.discount_on);
export function hasScopedEligibility(promotion) {
  return (promotion?.promotion_details?.length ?? 0) > 0;
}
export function hasConditionalRules(promotion) {
  return (promotion?.promotion_rules?.length ?? 0) > 0;
}
