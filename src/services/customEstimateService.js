// Custom Estimate — CONFIRMED LIVE 2026-10-02 (real capture of OrnaVerse's
// own Estimation F1 > Custom tab). Also confirmed end-to-end THROUGH OUR OWN
// APP the same day: metal-only Custom Estimate -> Order HO-RPO-10-26-00002
// (EntityId 311, customer Tahir Kutty), verified against OrnaVerse's own UAT
// client afterward (identical rate/sub_total/tax/net, status Posted). A
// metal+stone+labour attempt (EntityId unassigned — Order/Create 500'd) hit
// a real OrnaVerse-side data bug once labour is attached — see
// applyLabourToLine's own header below for the exact mechanism.
//
// There is NO separate "Custom Estimate" document. "Custom" is a bespoke
// LINE-ITEM BUILDER (pick a catalog item flagged allow_custom_estimation,
// edit its weight, add stones, optionally apply labour) whose one output is
// a fully-priced line_item fed straight into a normal POS Order/Invoice
// Create — see transactions/page.jsx's SoldItemFlowForm / repairService.js
// for the same "self-contained flow, not the shared cart" pattern already
// used elsewhere in this app.
//
// PRICING MODEL (confirmed): the base metal line is priced ONCE via the
// already-existing pricingService.calculateItemRates() (same SetSalesItems
// call every other catalog-item pricing path in this app already uses —
// party_state/tax_group_id/party_discounting_policy_id seen in OrnaVerse's
// own captured request are NOT required: calculateItemRates already omits
// them and prices correctly). Editing Weight afterward is CLIENT-SIDE ONLY
// (confirmed: no network call fires) — same "server supplies the rate once,
// client recomputes weight-dependent fields" pattern as URD Purchase's
// Metal category (see returnItemsService.js's calculateURDItems header).

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

/**
 * Catalog items eligible for Custom Estimate — gated by `allow_custom_estimation`
 * on the item master, not a free search. CONFIRMED LIVE: on this tenant,
 * exactly one such item exists ("Custom 18KT Ring", item_id 125282).
 * @returns {Promise<object[]>} full item master rows (incl. item_components)
 */
export async function getCustomEstimateItems() {
  const response = await axiosInstance.post(API.ITEMS.LIST, {
    allow_custom_estimation: true,
    Take: 500,
    Sort: ['item_name'],
  });
  return response.data?.Entities ?? [];
}

/**
 * Item sizes scoped to one item TYPE (e.g. Ring) — CONFIRMED LIVE: a
 * DIFFERENT call shape than itemService.getItemSizes() (which fetches the
 * full unfiltered list for the Catalog Filters panel). `type_id` is the
 * chosen item's own `type_id`.
 * @param {number} typeId
 * @returns {Promise<object[]>}
 */
export async function getItemSizesByType(typeId) {
  if (!typeId) return [];
  const response = await axiosInstance.post(API.ITEMS.SIZES, {
    type_id: typeId,
    Take: 500,
  });
  return response.data?.Entities ?? [];
}

/**
 * Per-stone rate lookup, fired once per "Add" in the Diamonds/stones table.
 * CONFIRMED LIVE field list — every field below was present in the real
 * captured request; `is_purchase` always false here (this is a sale, not a
 * purchase). A rate of 0 came back on the live tenant for the one
 * combination tested (no costing rule configured there) — that's a
 * tenant-data gap, not a sign this call is wrong.
 * @param {{
 *   baseItemId: number, itemGroupId: number, typeId: number, shapeId: number,
 *   stoneColorId: number, qualityId: number, weight: number,
 *   salesCostingId: number, purchaseCostingId: number,
 * }} params
 * @returns {Promise<{ rate: number, is_cutomer_item: boolean }>}
 */
export async function getStoneRate({
  baseItemId, itemGroupId, typeId, shapeId, stoneColorId, qualityId, weight,
  salesCostingId, purchaseCostingId,
}) {
  const today = new Date();
  const response = await axiosInstance.post(API.HELPERS.GET_RATE, {
    base_item_id:       baseItemId,
    item_group_id:      itemGroupId,
    type_id:            typeId,
    shape_id:           shapeId,
    stone_color_id:     stoneColorId,
    quality_id:         qualityId,
    weight,
    sales_costing_id:   salesCostingId,
    purchase_costing_id: purchaseCostingId,
    from_date: today.toISOString(),
    to_date:   today.toISOString(),
    is_purchase: false,
  });
  return response.data ?? { rate: 0 };
}

/**
 * "Type" dropdown options for the Diamonds/stones table, scoped to the
 * chosen Item Group (e.g. 112 = Diamond) — CONFIRMED LIVE.
 * @param {number} itemGroupId
 * @returns {Promise<object[]>}
 */
export async function getStoneTypeDetails(itemGroupId) {
  if (!itemGroupId) return [];
  const response = await axiosInstance.post(API.CUSTOM.TYPE_DETAILS_LIST, {
    item_group_id: itemGroupId,
    Take: 500,
  });
  return response.data?.Entities ?? [];
}

/**
 * Proposes a labour/making-charge line for the "Apply labour" step —
 * CONFIRMED LIVE (this call itself succeeds; see applyLabourToLine's own
 * header for the step that's confirmed broken server-side on this tenant).
 * @param {{
 *   itemId: number, itemAttributeId: number, itemGroupId: number, typeId: number,
 *   karatId: number, pieces: number, weight: number, netWeight: number,
 *   diamondWeight: number, stoneWeight: number, parts: number, companyId: number,
 *   purity: number, baseItemId: number,
 * }} params
 * @returns {Promise<object[]>} proposed operation rows (operation_id, rate,
 *   rate_percentage, amount, base_amount, operation_name, ...)
 */
export async function getLabourRate({
  itemId, itemAttributeId, itemGroupId, typeId, karatId, pieces, weight,
  netWeight, diamondWeight = 0, stoneWeight = 0, parts = 1, companyId,
  purity, baseItemId,
}) {
  const today = new Date();
  const response = await axiosInstance.post(API.HELPERS.GET_LABOUR_RATE, {
    item_id: itemId,
    item_attribute_id: itemAttributeId,
    item_group_id: itemGroupId,
    type_id: typeId,
    karat_id: karatId,
    pieces,
    weight,
    net_weight: netWeight,
    diamond_weight: diamondWeight,
    stone_weight: stoneWeight,
    parts,
    company_id: companyId,
    is_purchase: false,
    exchange_rate: 1,
    purity,
    base_item_id: baseItemId,
    from_date: today.toISOString(),
    to_date:   today.toISOString(),
  });
  return response.data?.Entities ?? [];
}

/**
 * Re-prices the line WITH labour operations attached — CONFIRMED LIVE
 * 2026-10-02: this call itself succeeds (folds the labour amount into the
 * line's rate/amount). The problem surfaces one step later: the operation
 * row this endpoint returns has `amount` (e.g. 6250) and `base_amount`
 * (e.g. 2500) that don't reconcile for a 1x exchange rate, and submitting
 * that row's line_item to Order/Create 500s generically
 * (`{"Error":{"Code":"Exception","Message":"An error occurred while
 * processing your request."}}`) — a real OrnaVerse-side data issue in its
 * own labour-rate response, not something wrong with the submitted payload
 * (confirmed: the identical item/operations shape posts fine once
 * item_operations is empty). Callers must surface this as an
 * expected-possible failure at ORDER SUBMIT time, not at this call.
 * @param {{ item: object, operations: object[], documentDate: Date, documentId: number }} params
 * @returns {Promise<object[]>} re-priced line
 */
export async function applyLabourToLine({ item, operations, documentDate = new Date(), documentId }) {
  const response = await axiosInstance.post(API.HELPERS.SET_SALES_ITEMS, {
    selected_products: [{ ...item, item_operations: operations }],
    price_list_id: 0,
    calculate_rates: false,
    document_date: documentDate.toUTCString(),
    document_id: documentId,
    exchange_rate: 1,
    generate_line_no: false,
    generate_lot_no: false,
    is_labour_applicable: true,
    is_purchase: false,
    is_tax_applicable: true,
    is_gold_lock: true,
  });
  return response.data?.Entities ?? [];
}
