// The two lookups a POS Return needs before it can be created.
//
// A return line item cannot be hand-built from typed item_id/rate/qty — the
// server expects the ~186-field computed object produced by
// Helpers/SetReturnItems, whose own input is the full nested sold-item
// record from POS/InvoiceItems/List (get_child:true).
//
// Mirrors the sales side conceptually: SetSalesItems : new sale ::
// SetReturnItems : return.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import APP_CONFIG from '@/constants/appConfig';

/**
 * Items this customer has actually purchased, i.e. what they're allowed to
 * return. Each row is the FULL nested item (get_child:true) and carries
 * ref_transaction_id / ref_document_id pointing back at the original
 * invoice — that linkage is what ties the return to the sale, so never
 * strip it before handing the row to calculateReturnItems(). Each row's own
 * `company_id` is the store that originally sold it — never stripped,
 * needed to detect a cross-store item (see partitionSoldItemsByStore).
 *
 * NO LONGER filtered to the active store — CORRECTED 2026-10-02 (real
 * capture of OrnaVerse's own Returns screen): a cross-store item is
 * genuinely returnable here, just routed through a separate Interstore
 * Return alongside the regular Return/Exchange/Buyback document (mandatory
 * condition photo, approval by the origin store) — see
 * interstoreReturnService.js and transactions/page.jsx's SoldItemFlowForm.
 * This endpoint ignores `company_id` server-side regardless (identical rows
 * come back no matter what's sent); it's still sent in case that changes.
 *
 * @param {{ partyId: number, companyId?: number, take?: number, transactionType?: number }} params
 *   transactionType — CONFIRMED LIVE 2026-10-02 (real network capture of
 *   OrnaVerse's own Returns screen): Return=1, Exchange=2, Buyback=2 — a
 *   DIFFERENT enum than APP_CONFIG.INTERSTORE_RETURN_TRANSACTION_TYPE
 *   (Return=1, Exchange=2, Buyback=3) despite the superficial overlap —
 *   see transactions/page.jsx's SOLD_ITEM_TRANSACTION_TYPE for the one used
 *   here. This function used to hardcode 1 regardless of caller, so
 *   Exchange and Buyback (transactions/page.jsx) were silently showing
 *   Return's own sold-item population instead of their own — reported
 *   directly ("unable to see the products"), root-caused via live capture.
 * @returns {Promise<object[]>} sold-item rows, every store this customer bought from
 */
export async function getSoldItems({ partyId, companyId, take = 25, transactionType = 1 }) {
  if (!partyId) return [];
  const response = await axiosInstance.post(API.RETURNS.SOLD_ITEMS, {
    Take:             take,
    party_id:         partyId,
    transaction_type: transactionType,
    get_child:        true,   // essential — brings item_components[] etc.
    company_id:       companyId,
    IncludeColumns: [
      'item_code', 'item_line_no', 'pieces', 'weight',
      'net_weight', 'sku', 'document_no',
    ],
  });
  return response.data?.Entities ?? [];
}

/**
 * Prices selected sold items for RETURN. Pass the sold-item rows through
 * UNMODIFIED (same contract as calculateItemRates/SetSalesItems — the
 * server needs the whole shape to recompute against).
 *
 * is_tax_applicable:false and calculate_rates:false mirror OrnaVerse's own
 * Returns screen: a return reverses the ORIGINAL sale's figures rather than
 * re-pricing at today's metal rate.
 *
 * @param {{ items: object[], documentDate?: Date }} params
 * @returns {Promise<object[]>} line items ready for Return/Create
 */
export async function calculateReturnItems({ items, documentDate = new Date() }) {
  if (!items?.length) return [];
  const response = await axiosInstance.post(API.HELPERS.SET_RETURN_ITEMS, {
    selected_products: items,
    exchange_rate:     1,
    // their UI sends a bare JS Date string here, not ISO
    document_date:     documentDate.toDateString(),
    is_tax_applicable: false,
    calculate_rates:   false,
  });
  return response.data?.Entities ?? [];
}

/**
 * Same, for BUY BACK. Separate endpoint rather than a flag — a buyback is
 * the store re-purchasing the piece (valued as goods) rather than reversing
 * a sale, so the server prices it differently. Its request notably omits
 * `calculate_rates` entirely; the return variant's body shape is not
 * equivalent.
 *
 * @param {{ items: object[], documentDate?: Date }} params
 * @returns {Promise<object[]>} line items ready for BuyBack/Create
 */
export async function calculateBuybackItems({ items, documentDate = new Date() }) {
  if (!items?.length) return [];
  const response = await axiosInstance.post(API.HELPERS.SET_BUYBACK_ITEMS, {
    selected_products: items,
    document_date:     documentDate.toDateString(),
    exchange_rate:     1,
    is_tax_applicable: false,
  });
  return response.data?.Entities ?? [];
}

/**
 * Same, for EXCHANGE.
 *
 * An Exchange document is ONE-SIDED, exactly like a Return: it carries a
 * single `line_items` array (the item coming back) and no replacement item.
 * Completing it simply raises the customer's credit; they then buy the
 * replacement as a normal sale that spends that credit — don't model a
 * second line-item set for it.
 *
 * @param {{ items: object[], documentDate?: Date }} params
 * @returns {Promise<object[]>} line items ready for Exchange/Create
 */
export async function calculateExchangeItems({ items, documentDate = new Date() }) {
  if (!items?.length) return [];
  const response = await axiosInstance.post(API.HELPERS.SET_EXCHANGE_ITEMS, {
    selected_products: items,
    document_date:     documentDate.toDateString(),
    exchange_rate:     1,
    is_tax_applicable: false,
  });
  return response.data?.Entities ?? [];
}

/**
 * Prices URD (unregistered dealer / old gold) purchase lines — CONFIRMED
 * LIVE 2026-10-02 via network capture of OrnaVerse's own URD Purchase
 * screen. Reported directly: our own form was hand-computing sub_total/
 * net_amount/tax client-side instead of calling this endpoint at all, so it
 * never applied the real purchase coefficient OrnaVerse itself uses.
 *
 * `coef` — their client ALSO queries Services/Costing/Policy/List
 * (`{policy_type: 10}`) for a possible per-tenant override before falling
 * back to this default; on this tenant that list came back empty
 * (TotalCount: 0), so 1.05 is what was actually observed in effect, not a
 * guess. Not wired here (no confirmed-live example of a NON-empty policy
 * response to model the override shape against) — if OrnaVerse ever
 * configures a real policy for this tenant, this default would need
 * revisiting against a fresh capture.
 *
 * `items` must be the REAL master item (useURDMasterItem — already fetched
 * correctly) with just `weight`/`purity`/`pieces` overridden per line, same
 * "never hand-build, always pass the real record through" rule as every
 * other pricing call in this codebase.
 *
 * @param {{ items: object[], documentDate?: Date }} params
 * @returns {Promise<object[]>} priced rows, ready to become line_items
 */
export async function calculateURDItems({ items, documentDate = new Date() }) {
  if (!items?.length) return [];
  const response = await axiosInstance.post(API.HELPERS.SET_URD_ITEMS, {
    selected_products:    items,
    generate_line_no:     true,
    generate_lot_no:      false,
    document_date:        documentDate.toDateString(),
    exchange_rate:        1,
    is_tax_applicable:    false,
    is_labour_applicable: false,
    calculate_rates:      true,
    document_id:          APP_CONFIG.DOCUMENT_TYPES.URD_PURCHASE,
    price_list_id:        0,
    coef:                 1.05,
  });
  return response.data?.Entities ?? [];
}
