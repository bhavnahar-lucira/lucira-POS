// Client-side service for Nector product reviews + loyalty points.
//
// Two INDEPENDENT Nector integrations exist, confirmed live 2026-09-28 —
// don't conflate them:
//   1. getReviewSummary/getReviews — calls our own /api/nector proxy (the
//      Shopify storefront's "Custom Checkout Webhook", NECTOR_WEBHOOK_KEY) —
//      never Nector directly, API key never reaches the browser. Fail-safe:
//      none of these throw.
//   2. getLoyaltyCheckoutSettings/previewLoyaltyCheckout — OrnaVerse's OWN
//      native Nector integration (Services/CRM/LoyaltyCheckout/*), the one
//      their real POS screen actually uses for checkout redemption. Found by
//      reading their live client bundle (chunk-YMLDVNPO.js) — no Nector
//      credential of ours involved at all; OrnaVerse holds its own
//      connection to Nector server-side and we just call OrnaVerse like any
//      other Services/* endpoint (cookie session, axiosInstance).
//
// THESE REPORT DIFFERENT BALANCES FOR THE SAME CUSTOMER — confirmed live:
// the webhook (path 1) said 500 available; LoyaltyCheckout/Preview (path 2)
// said coin_value 1100 for the identical phone number, same moment. Path 2 is
// the one to trust — it's what OrnaVerse's own screen uses and what actually
// gets redeemed when a document posts a receipt row against it. The old
// path-1-backed balance lookup (getCustomerLoyalty, used by Customer 360's
// Points tab) was reported showing a stale/wrong figure there for exactly
// this reason — reported directly 2026-10-08 (0 on the profile vs. 500 at
// checkout for the same customer) — and was removed in favour of pointing
// the Points tab at path 2 too (useNectorCheckoutInfo with a safe probe
// cart), so every balance this app shows now comes from the one real source.

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
 * Same call, routed through a shared concurrency-capped queue — the catalog
 * grid isn't virtualized, so every mounted ProductCard calls this
 * independently (via useProductReviewSummary) once its style resolves.
 * Confirmed live 2026-09-18: ~100 simultaneous reviews-count requests
 * compounds with the same-shaped Style/Retrieve flood (see
 * getDesignVariantsQueued in itemService.js) to produce the multi-minute
 * delay before a catalog card's rating badge appears.
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
 * What a customer can redeem right now, given the cart/order's total value —
 * CONFIRMED LIVE 2026-09-22 against the real "Custom Checkout Webhook"
 * integration the Shopify storefront's own checkout backend uses (read
 * directly from its source — see api/nector/[...path]/route.js's header for
 * the full trail). This REPLACES the old leads/wallettransactions approach
 * for redemption purposes: `amount` here is Nector's own eligibility input
 * (the cart/order total), NOT the coin amount — it decides what's
 * redeemable from its own configured rules, we don't tell it how much to
 * take.
 *
 * 200 → { data: { points_balance, offers[], promotions: [{ type,
 *   coin_value, fiat_value, id, ... }] } } — at least one redemption is
 *   available at this amount.
 * 422 → { data: { message: "No discount is available", earning_rule } } —
 *   NOT an error to report; below Nector's minimum cart amount for this
 *   customer's tier, or a genuinely non-enrolled customer. Confirmed live:
 *   this tenant's real minimum is ₹10,000.
 *
 * @param {{ mobile: string, amount: number }} params — amount is the
 *   cart/order's total value, not a coin amount.
 * @returns {Promise<{ found: boolean, pointsBalance: number, promotions: object[] }>}
 */
export async function getNectorCheckoutInfo({ mobile, amount }) {
  const empty = { found: false, pointsBalance: 0, promotions: [] };
  if (!mobile || !(amount > 0)) return empty;

  try {
    const res = await fetch('/api/nector/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, action: 'list', amount }),
    });
    if (!res.ok) return empty; // 422 "No discount is available", or any other failure

    const json = await res.json();
    const data = json?.data;
    if (!data) return empty;

    return {
      found:         true,
      pointsBalance: Number(data.points_balance) || 0,
      promotions:    Array.isArray(data.promotions) ? data.promotions : [],
    };
  } catch (err) {
    console.warn('[nectorService] getNectorCheckoutInfo failed:', err);
    return empty;
  }
}

/**
 * Redeems Lucira Coins against a real, completed sale — the "perform" side
 * of the same Custom Checkout Webhook integration `getNectorCheckoutInfo`
 * reads from. Fires AFTER a real POS sale has already completed; a failure
 * here never blocks or reverses that sale (mirrors the storefront's own
 * checkout.js, which calls this fire-and-forget at order completion too).
 *
 * `amount` is again the sale's total value (Nector's own eligibility
 * input), not a coin amount — Nector applies whatever redemption it already
 * decided was available via the earlier `list` call.
 *
 * @param {{ mobile: string, amount: number, referenceOrderId: string|number }} params
 * @returns {Promise<{ ok: boolean, reason?: string }>} — never throws;
 *   caller decides what (if anything) to do with a failure.
 */
export async function performNectorRedemption({ mobile, amount, referenceOrderId }) {
  if (!mobile || !(amount > 0) || !referenceOrderId) return { ok: false, reason: 'invalid_params' };

  try {
    // Same-origin call — the operator's session cookie rides along
    // automatically; the route itself rejects with 401 if no one's signed in.
    const res = await fetch('/api/nector/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile,
        action: 'perform',
        amount,
        reference_order_id: String(referenceOrderId),
        wallet_type: 'coins',
      }),
    });

    if (!res.ok) return { ok: false, reason: res.status === 401 ? 'not_authenticated' : `http_${res.status}` };
    return { ok: true };
  } catch (err) {
    console.warn('[nectorService] performNectorRedemption failed:', err);
    return { ok: false, reason: 'network_error' };
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
