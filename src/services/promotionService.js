// Promotions and gift vouchers — CRM module.
// All functions are pure HTTP wrappers — no business logic.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

/**
 * Fetches every promotion record. GetPromotion does not filter by code
 * (confirmed 2026-07-15 — it returns the same fixed record regardless of
 * input), so code validation and the checkout promo picker both work off
 * this full list, filtered/matched client-side.
 * @returns {Promise<import('axios').AxiosResponse>} { Entities: PromotionRow[], TotalCount }
 */
export function listPromotions() {
  return axiosInstance.post(API.CRM.LIST, { Take: 0 });
}

/**
 * Prices a promotion against LINE ITEMS — the discount calculator, and the
 * only thing that knows what a promotion is actually worth.
 *
 * CAPTURED VERBATIM from OrnaVerse's own POS Order counter 2026-08-05. The
 * previous signature here ({ transaction_id, company_id, party_id }) was a
 * guess and was wrong in the way that mattered most: this is a PRE-Create
 * helper over line items, not something you call on a saved draft. That
 * mistake is why the discount was being computed client-side at all.
 *
 * WHY IT CANNOT BE DONE LOCALLY. A promotion's percentage does NOT apply to
 * the subtotal. `discount_calc_on` selects the base — 3 = the diamond
 * component, 6 = making charges, 1 = the whole value — so "20% Off Diamond"
 * on a ₹1,04,699 line is 20% of its ₹60,888 of diamond = ₹12,177.60, not
 * ₹20,939. Nearly every promotion on this tenant is component-scoped.
 * The server also RE-TAXES: taxable_amount drops by the discount and
 * tax_amount/net_amount are recomputed, while base_* keep the pre-discount
 * figures.
 *
 * Request (confirmed):
 *   { selected_products: [ <priced line items> ],
 *     promotion:  <full PromotionRow from Promotion/List, UNMODIFIED>,
 *     promotions: [ <invoice_promotions accumulated so far> ],
 *     gift_voucher_number: '', exchange_rate: 1, document_id }
 * Response: { items: [ <re-priced lines> ], invoice_promotions: [ <row> ] }
 *
 * `invoice_promotions` is the document's `promotion_details[]` — their client
 * passes it through untouched. STACKING is a sequential fold: feed the
 * previous round's `items` back in as selected_products and its
 * `invoice_promotions` in as `promotions`. Verified live: 0 → 12,177.60 →
 * 17,412.55 cumulative line discount, tax recomputed each round. Note the
 * response returns only the NEW promotion's row, so the caller accumulates.
 *
 * `override_amount` — confirmed live 2026-09-30 from OrnaVerse's own "Enter
 * Promo" dialog's "Override Amount" field: replaces this promotion's own
 * Net/Gross-calculated discount with an operator-typed final-bill reduction.
 * Only meaningful alongside a real promo code. Any cap is enforced entirely
 * SERVER-SIDE via the promotion's own `promotion_rules[]` brackets (verified
 * by requesting an amount above a bracket's cap and getting it clamped back)
 * — this app does not add a separate cap on top of that.
 *
 * @param {{
 *   selected_products: object[],
 *   promotion:         object,
 *   promotions?:       object[],
 *   document_id:       number,
 *   exchange_rate?:    number,
 *   gift_voucher_number?: string,
 *   override_amount?:  number|null,
 * }} params
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function applyPromotions({
  selected_products, promotion, promotions = [],
  document_id, exchange_rate = 1, gift_voucher_number = '', override_amount = null,
}) {
  return axiosInstance.post(API.CRM.APPLY_PROMOTIONS, {
    selected_products,
    promotion,
    promotions,
    gift_voucher_number,
    exchange_rate,
    document_id,
    ...(override_amount != null && { override_amount }),
  });
}

// REMOVED 2026-09-08 — reversePromotion(), checkGiftVoucherUtilization(),
// and redeemGiftVoucher() had zero callers anywhere in the app (confirmed
// via a dead-code audit) — the gift card/voucher payment path was never
// wired up beyond cartSlice's own applyGiftCard/applyGiftVoucher actions,
// which are themselves dead for the same reason (see that slice's own
// comment). API.CRM.REVERSE_PROMOTION / GIFT_VOUCHER_CHECK_UTILIZATION /
// GIFT_VOUCHER_REDEEM are untouched in apiEndpoints.js in case this
// payment method gets built out later.