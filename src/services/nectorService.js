// Client-side service for Nector product reviews + loyalty points.
//
// getReviewSummary/getReviews call our own /api/nector proxy. Loyalty
// balance/redemption goes through OrnaVerse's own native LoyaltyCheckout
// integration (Services/CRM/LoyaltyCheckout/*) below — cookie session,
// axiosInstance, no Nector credential of ours involved.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import { createConcurrencyQueue } from '@/lib/concurrencyQueue';

const SOURCE = 'shopify';

/**
 * Rating summary for one product — used for catalog card stars and the
 * product detail page's reviews header.
 * @param {string|number} shopifyProductId
 * @returns {Promise<{ count: number, sum: number }>}
 */
export async function getReviewSummary(shopifyProductId) {
  if (!shopifyProductId) return { count: 0, sum: 0 };

  try {
    const params = new URLSearchParams({
      reference_product_source: SOURCE,
      reference_product_id:     String(shopifyProductId),
    });
    const res = await fetch(`/api/nector/reviews-count?${params}`);
    if (!res.ok) return { count: 0, sum: 0 };

    const json = await res.json();
    const countsum = json?.data?.countsum;
    return {
      count: countsum?.count ?? 0,
      sum:   countsum?.sum   ?? 0,
    };
  } catch (err) {
    console.warn('[nectorService] getReviewSummary failed:', err);
    return { count: 0, sum: 0 };
  }
}

/**
 * Same call, routed through a shared concurrency-capped queue — even with
 * the grid now virtualized (react-virtuoso's VirtuosoGrid, see ProductGrid),
 * every mounted-plus-overscanned ProductCard still calls this independently
 * (via useProductReviewSummary) once its style resolves. Confirmed live
 * 2026-09-18, before virtualization existed: ~100 simultaneous reviews-count
 * requests compounded with the same-shaped Style/Retrieve flood (see
 * getDesignVariantsQueued in itemService.js) to produce the multi-minute
 * delay before a catalog card's rating badge appeared. Both are now also
 * MASTER_DATA-cached and persisted across reloads (see
 * useProductReviewSummary + queryPersister.js), so this queue only matters
 * for products a session hasn't seen before.
 */
export const getReviewSummaryQueued = createConcurrencyQueue(getReviewSummary, { concurrency: 6 });

/**
 * One page of approved reviews for a product, newest first.
 * @param {{ shopifyProductId: string|number, page?: number, limit?: number }} params
 * @returns {Promise<{ items: object[], count: number, hasNext: boolean }>}
 */
export async function getReviews({ shopifyProductId, page = 1, limit = 10 }) {
  if (!shopifyProductId) return { items: [], count: 0, hasNext: false };

  try {
    const params = new URLSearchParams({
      reference_product_source: SOURCE,
      reference_product_id:     String(shopifyProductId),
      is_approved:               'true',
      page:                      String(page),
      limit:                     String(limit),
      sort:                      'posted_at',
      sort_op:                   'DESC',
    });
    const res = await fetch(`/api/nector/reviews?${params}`);
    if (!res.ok) return { items: [], count: 0, hasNext: false };

    const json = await res.json();
    const data = json?.data ?? {};
    return {
      items:   Array.isArray(data.items) ? data.items : [],
      count:   data.count ?? 0,
      hasNext: data.cursor?.has_next ?? false,
    };
  } catch (err) {
    console.warn('[nectorService] getReviews failed:', err);
    return { items: [], count: 0, hasNext: false };
  }
}

/**
 * OrnaVerse's own native Nector Loyalty config for a store — real fields
 * confirmed live 2026-09-28 (Pune/company_id 4):
 *   { loyalty_provider: 1, third_party_provider: 1, enable_nector_credits: false,
 *     block_sale_if_nector_unavailable: true, min_invoice_value: 10000,
 *     item_groups: [101] }
 * `item_groups` restricts which lines' taxable_amount counts toward
 * eligibility (empty = whole cart counts) — see evaluateLoyaltyEligibility
 * in lib/checkout/loyaltyEligibility.js, which mirrors their own client's
 * `evaluateLoyaltyEligibility`/`W5e` exactly.
 *
 * @param {number} companyId
 * @returns {Promise<object|null>}
 */
export async function getLoyaltyCheckoutSettings(companyId) {
  if (!companyId) return null;
  try {
    const response = await axiosInstance.post(API.CRM.LOYALTY_CHECKOUT_SETTINGS, {
      company_id: companyId,
    });
    return response.data?.Entity ?? null;
  } catch (err) {
    // A store with no LoyaltyCheckout config at all (or a real outage)
    // degrades to "loyalty tile doesn't apply here" — isThirdPartyLoyalty(null)
    // already returns false safely — never a crashed checkout screen.
    console.warn('[nectorService] getLoyaltyCheckoutSettings failed:', err?.serverMessage ?? err?.message);
    return null;
  }
}

/**
 * The REAL, live-checked redemption quote for this customer/cart — confirmed
 * live 2026-09-28 to return a genuinely different (correct) balance than the
 * Shopify webhook above (see this file's header). This is what OrnaVerse's
 * own POS screen calls before letting an operator add a Loyalty payment row,
 * and what the resulting receipt row (documentFields.js's Nector branch)
 * must be built from — coin_value/credit_value here map directly onto that
 * branch's fields.
 *
 * No separate "perform"/redeem call exists for this integration (only
 * GetSettings + Preview were found in OrnaVerse's own client bundle) — the
 * actual settlement happens transactionally when Create submits a receipt
 * row referencing this quote, the same way any other tender settles.
 *
 * @param {{
 *   companyId: number, partyId: number, documentNo?: string,
 *   cartAmount: number, applyCoins?: boolean, applyCredits?: boolean,
 *   mobile: string, netAmount: number, remainingDue: number,
 *   lines: { item_group_id: number|null, taxable_amount: number }[],
 * }} params
 * @returns {Promise<{ success: boolean, error?: string, coin_value: number,
 *   credit_value: number, cart_amount: number, wallet_type: number }|null>}
 */
export async function previewLoyaltyCheckout({
  companyId, partyId, documentNo, cartAmount, applyCoins = true, applyCredits = false,
  mobile, netAmount, remainingDue, lines,
}) {
  if (!companyId || !partyId || !mobile) return { success: false, error: 'Missing required fields.' };
  try {
    const response = await axiosInstance.post(API.CRM.LOYALTY_CHECKOUT_PREVIEW, {
      company_id: companyId,
      party_id: partyId,
      document_no: documentNo ?? 'DRAFT',
      cart_amount: cartAmount,
      apply_coins: applyCoins,
      apply_credits: applyCredits,
      mobile,
      net_amount: netAmount,
      remaining_due: remainingDue,
      lines: lines ?? [],
    });
    // Confirmed live 2026-09-28: a genuinely ineligible customer can come
    // back as a 200 with Entity.success:false (their own client checks
    // this) — normalize both shapes into one, below.
    return response.data?.Entity ?? { success: false, error: 'Loyalty points could not be loaded.' };
  } catch (err) {
    // CONFIRMED LIVE 2026-09-28: a different real customer's ineligibility
    // came back as an HTTP 400 "Insufficient balance", not a 200 with
    // success:false — both shapes are real, both must degrade to the SAME
    // normalized result so every customer gets consistent behavior, not
    // just the one this was first tested against.
    return { success: false, error: err?.serverMessage ?? 'Loyalty points could not be loaded.' };
  }
}
