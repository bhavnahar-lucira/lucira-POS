// Curated business reports — each function hits the SAME dedicated endpoint
// OrnaVerse's own Reporting module calls (confirmed live 2026-10-16 by
// capturing its network traffic report-by-report). These are hand-built,
// purpose-specific endpoints, not the generic Ad-hoc Report query engine
// (Services/Reporting/AdhocReport/Run) — that's wired separately.
//
// Every report here is scoped to ONE store (company_ids: [activeStoreId]),
// matching this app's existing single-store convention — there is no "all
// stores" aggregate anywhere else in the codebase to mirror.
//
// `fromDate`/`toDate` are plain "YYYY-MM-DD" strings straight from a
// <input type="date">. POSDashbaord/List is the one exception — its own
// capture showed OrnaVerse's client sending RFC-1123 GMT strings
// ("Fri, 16 Oct 2026 00:00:00 GMT"), so toRfc1123() below converts for that
// one call only.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

function toRfc1123(dateOnlyString) {
  return new Date(`${dateOnlyString}T00:00:00Z`).toUTCString();
}

/**
 * Sales Summary / POS Dashboard — KPIs + payment-mode breakdown for a date
 * range. CONFIRMED LIVE response shape: { total_collections: [{mode_type,
 * sales}], top_products, categoryWiseSales, day_wise_sales, time_wise_sales,
 * sales_person_wise_sales, total_sales_amount, total_order_amount,
 * mto_orders, mto_sales, total_urd, rts_and_mto, returns, pending_mto,
 * scheme } — the breakdown arrays were empty in every capture (no sales
 * that day), so their row shape is unconfirmed; only total_collections and
 * the top-level KPI numbers are rendered here. The dedicated
 * getCategoryWiseSales/getSalesPersonWiseSales calls below cover that
 * detail with a confirmed shape instead of guessing at this one.
 */
export async function getPosDashboard({ companyId, fromDate, toDate }) {
  const response = await axiosInstance.post(API.REPORTS.POS_DASHBOARD, {
    company_ids: [companyId],
    from_date:   toRfc1123(fromDate),
    to_date:     toRfc1123(toDate),
  });
  return response.data;
}

/**
 * Category-wise sales totals (pieces/weight/amount, with diamond/stone/
 * other-component split) for a date range.
 * @returns {Promise<object[]>} Entities
 */
export async function getCategoryWiseSales({ companyId, fromDate, toDate, take = 100 }) {
  const response = await axiosInstance.post(API.REPORTS.CATEGORY_WISE_SALES, {
    Take: take,
    document_status: 1,
    company_ids: [companyId],
    from_date: fromDate,
    to_date: toDate,
    IncludeColumns: [
      'type_name', 'total_pieces', 'total_weight', 'total_net_weight',
      'total_sub_total', 'total_discount', 'total_tax_amount', 'total_Net_Amount',
      'total_diamond_pieces', 'total_diamond_weight', 'total_diamond_amount',
      'total_stone_pieces', 'total_stone_weight',
      'total_color_stone_pieces', 'total_color_stone_weight', 'total_color_stone_amount',
      'total_other_pieces', 'total_other_weight', 'total_other_amount',
    ],
  });
  return response.data?.Entities ?? [];
}

/**
 * Per-salesperson sales totals for a date range — CONFIRMED LIVE response
 * row: { employee_code, employee_name, pieces, weight, net_weight,
 * diamond_pieces, diamond_weight, diamond_amount, color_stone_pieces,
 * color_stone_weight, color_stone_amount, sub_total, net_amount,
 * company_code, mailing_name }. A return/exchange/buyback/URD line shows up
 * as its own row with employee_code suffixed "(Return/Exchange/Buyback/URD)"
 * and negative amounts — real OrnaVerse behavior, not a bug.
 * @returns {Promise<object[]>} Entities
 */
export async function getSalesPersonWiseSales({ companyId, fromDate, toDate, take = 100 }) {
  const response = await axiosInstance.post(API.REPORTS.SALES_PERSON_WISE_SALES, {
    Take: take,
    document_status: 1,
    company_ids: [companyId],
    from_date: fromDate,
    to_date: toDate,
    IncludeColumns: [
      'document_date', 'employee_code', 'employee_name', 'pieces', 'weight', 'net_weight',
      'diamond_pieces', 'diamond_weight', 'diamond_amount',
      'color_stone_pieces', 'color_stone_weight', 'color_stone_amount',
      'sub_total', 'net_amount', 'company_code', 'mailing_name',
    ],
  });
  return response.data?.Entities ?? [];
}

/**
 * Merchandising velocity/health per SKU for a date range — CONFIRMED LIVE:
 * the report screen's own default load calls .../SKUVelocity/List and gets
 * a 404; the real working endpoint (fired once "Run Report" is clicked
 * there) has no /List suffix at all. Response: { Entities: [{ ItemCode,
 * ItemGroup, TotalQuantity, TotalWeight, TotalValue, NormalizedVelocity,
 * VelocityTier, StockStatus, VelocityRank, Recommendation, DaysActive,
 * WeightBracket, DaysOfInventory? }] }.
 * @returns {Promise<object[]>} Entities
 */
export async function getSkuVelocity({ companyId, fromDate, toDate }) {
  const response = await axiosInstance.post(API.REPORTS.SKU_VELOCITY, {
    company_ids: [companyId],
    from_date: fromDate,
    to_date: toDate,
  });
  return response.data?.Entities ?? [];
}

/**
 * Open (unfulfilled/unbilled) POS orders for a date range — CONFIRMED LIVE
 * response row carries document_no/document_date/party_name/balance_amount/
 * net_amount/receipt_amount at the top level, plus a nested item_components[]
 * per physical piece on the order (not flattened here — see this report's
 * own header note on orderFulfillmentService.js for the equivalent
 * fulfillment-pipeline detail if that's ever needed instead).
 * @returns {Promise<object[]>} Entities
 */
export async function getOpenPosOrders({ companyId, fromDate, toDate, take = 100 }) {
  const response = await axiosInstance.post(API.REPORTS.OPEN_POS_ORDERS, {
    Take: take,
    document_status: 1,
    company_ids: [companyId],
    from_date: fromDate,
    to_date: toDate,
    IncludeColumns: [
      'document_no', 'document_date', 'party_name',
      'pieces', 'weight', 'sub_total', 'tax_amount', 'net_amount',
      'receipt_amount', 'balance_amount',
    ],
  });
  return response.data?.Entities ?? [];
}
