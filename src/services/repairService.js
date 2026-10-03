// POS Repair workflow — full lifecycle management.
// All functions are pure HTTP wrappers — no business logic.
//
// REPAIR WORKFLOW:
//   1. RepairIn   — customer drops item at store (intake, assessment, estimation)
//   2. RepairOut  — item sent to craftsman/workshop for work
//   3. RepairInvoice — item returned to customer, billing raised
//
// Each stage has its own create/post flow.
// RepairInvoice has its own helpers (GET_SCHEME, GET_ADVANCES, etc.)
// mirroring the main invoice helpers but scoped to repair transactions.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import APP_CONFIG from '@/constants/appConfig';

// ─── REPAIR ORDER (the workshop job the intake is raised against) ─────────────
//
// A Repair In line item is COPIED from a Repair Order line, not free-typed —
// it points back at its source via ref_document_id/ref_transaction_id/
// ref_transaction_item_id. mapOrderLineToRepairInLine() below performs that
// projection.

/** document_id of the workshop Repair Order. */
export const REPAIR_ORDER_DOCUMENT_ID = 75;

/**
 * repair_type — read out of OrnaVerse's own bundle (RepairForm,
 * formKey "Inventory.Repair"). It drives which items can be picked.
 */
export const REPAIR_TYPE = {
  STOCK_ITEM:    1,  // repairing a piece from our own stock
  CUSTOMER_ITEM: 2,  // repairing something the customer bought from us
};

/** "Where will this be repaired?" — their counter's toggle. */
export const REPAIR_LOCATION_TYPE = {
  OUR_WORKSHOP: 1,
  HEAD_OFFICE:  2,
};

/**
 * Sold items eligible for repair.
 *
 * `transaction_type: 3` CONFIRMED LIVE 2026-10-02 (real network capture of
 * OrnaVerse's own Repair > Accept for Repair screen) — this part was
 * already correct. What was NOT correct, and is the actual root cause of
 * "no products show for a genuinely-purchased customer" (reported
 * directly): their own client sends `company_id: null` here — no store
 * restriction at all, since a customer can reasonably bring an item in for
 * repair at a different branch than the one they bought it from. This used
 * to send the ACTIVE store's real company_id instead, silently hiding every
 * item purchased at any other branch. `companyId` param kept (unused in the
 * request) only so existing callers don't need to change.
 *
 * @param {{ partyId: number, companyId?: number, take?: number }} params
 */
export async function getRepairableSoldItems({ partyId, take = 25 }) {
  if (!partyId) return [];
  const response = await axiosInstance.post(API.REPAIR.REPAIR_SOLD_ITEMS, {
    Take: take,
    party_id: partyId,
    company_id: null,
    transaction_type: 3,
    get_child: true,
  });
  return response.data?.Entities ?? [];
}

/**
 * Prices picked items for a Repair Order via Helpers/SetReturnItems — the
 * same helper Return uses — with document_id 75 and labour/tax off. Line
 * items are server-computed, so this is the only correct way to build them.
 *
 * @param {{ selectedProducts: object[], companyId: number }} params
 */
export async function priceRepairItems({ selectedProducts, companyId }) {
  const response = await axiosInstance.post(API.HELPERS.SET_RETURN_ITEMS, {
    selected_products:    selectedProducts,
    is_labour_applicable: false,
    is_tax_applicable:    false,
    document_id:          REPAIR_ORDER_DOCUMENT_ID,
    exchange_rate:        1,
    company_id:           companyId,
  });
  return response.data?.Entities ?? response.data ?? [];
}

/**
 * Resolves the stock location a repair lands in. Matched by name ("Repair")
 * rather than hardcoded, since the id is per-tenant. Falls back to the first
 * location.
 *
 * @param {number} companyId
 * @returns {Promise<number|null>}
 */
export async function getRepairLocationId(companyId) {
  const response = await axiosInstance.post(API.REPAIR.COMPANY_LOCATIONS, {
    Take: 50,
    company_id: companyId,
  });
  const rows = response.data?.Entities ?? [];
  const repairLocation = rows.find(
    (l) => /^repair$/i.test((l.location_name ?? l.name ?? '').trim()),
  );
  return (repairLocation ?? rows[0])?.location_id ?? null;
}

/**
 * Builds the Inventory/Repair Entity.
 *
 * Field list transcribed from OrnaVerse's own RepairForm definition (formKey
 * "Inventory.Repair", 49 fields) — their Save button never fires a Create on
 * this tenant, so the payload could not be captured from live traffic.
 *
 * NARROWED 2026-09-17 (previous note here said "500s even for a bare
 * minimal payload, needs OrnaVerse's team" — that was too broad, and
 * turned out to be exactly the kind of assumption RepairIn's own fix this
 * same day disproved for that sibling endpoint; re-tested properly rather
 * than left as "not our bug"). Isolated live on UAT:
 *   - `{document_id: 75}` alone → clean validation ("Date extends Number
 *     of Backdated days") — the endpoint is reachable and validates
 *     normally.
 *   - `document_date` alone, or `party_id` alone → each individually
 *     clean (different, sensible validation messages).
 *   - `document_date` + `party_id` TOGETHER → the opaque 500, reproduced
 *     with a real ISO date, `.toDateString()` format, `company_id` added
 *     or not, and two different real party_ids — always the same crash.
 * So the actual reachable minimal set here is genuinely narrower than
 * "everything but document_id/party_id/document_date" — something in
 * this specific pair's interaction (very possibly a customer-record date
 * lookup, e.g. registration/DOB, given how specifically it needs BOTH a
 * real date and a real party to trigger) breaks server-side. Line items
 * were never reached in this testing since the header alone already
 * fails with these three together. Flagging for OrnaVerse support with
 * this exact reproduction, rather than the previous blanket dead-end.
 */
export function buildRepairOrderPayload({
  partyId, partyName, phoneCode, address, stateName,
  companyId, financialYearId, ledgerId,
  documentDate, deliveryDate,
  repairType = REPAIR_TYPE.CUSTOMER_ITEM,
  repairLocationType = REPAIR_LOCATION_TYPE.OUR_WORKSHOP,
  repairLocation, locationId,
  lineItems, narration, remark,
  allowBackdatedEntry, numberOfBackdatedDays, isDocumentNumberEditable,
  autoPosting, isTaxApplicable,
}) {
  const sum = (field) =>
    +lineItems.reduce((s, l) => s + (Number(l[field]) || 0), 0).toFixed(3);
  const money = (field) =>
    +lineItems.reduce((s, l) => s + (Number(l[field]) || 0), 0).toFixed(2);

  const subTotal = money('sub_total');
  const netAmount = money('net_amount') || subTotal;

  return {
    // document_no deliberately omitted — the server assigns it.
    document_id:   REPAIR_ORDER_DOCUMENT_ID,
    document_date: documentDate,
    delivery_date: deliveryDate ?? null,
    party_id:      partyId,
    party_name:    partyName ?? '',
    phone_code:    phoneCode ?? '',
    address:       address ?? '',
    state_name:    stateName ?? '',
    company_id:        companyId,
    financial_year_id: financialYearId,
    ledger_id:         ledgerId,
    currency_id:   103,
    exchange_rate: 1,
    user_id:       null,
    ref_transaction_id: 0,
    // what kind of repair, and where it happens
    repair_type:          repairType,
    repair_location_type: repairLocationType,
    repair_location:      repairLocation,
    location_id:          locationId,
    is_transferred:       false,
    // aggregates, summed from the priced lines
    pieces:     sum('pieces'),
    weight:     sum('weight'),
    net_weight: sum('net_weight'),
    sub_total:      subTotal,
    base_sub_total: subTotal,
    taxable_amount: money('taxable_amount') || subTotal,
    tax_amount:     money('tax_amount'),
    discount:       money('discount'),
    additional_charges: 0,
    round_off:      0,
    net_amount:      netAmount,
    base_net_amount: netAmount,
    bill_no: '', bill_date: null, challan_no: '', challan_date: null,
    narration: narration ?? '',
    remark:    remark ?? '',
    payable_ledger_id:    155,
    receivable_ledger_id: 173,
    is_document_number_editable: isDocumentNumberEditable ?? false,
    allow_backdated_entry:       allowBackdatedEntry ?? true,
    number_of_backdated_days:    numberOfBackdatedDays ?? 60,
    auto_posting:      autoPosting ?? true,
    is_tax_applicable: isTaxApplicable ?? false,
    line_items: lineItems,
  };
}

/**
 * Creates a Repair Order (document 75).
 * @param {object} entity — output of buildRepairOrderPayload()
 */
export async function createRepairOrder(entity) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_ORDER_CREATE, {
    Entity: entity,
  });
  return response.data;
}

/**
 * Posts a Repair Order. Document 75 is auto_posting TRUE on this tenant, so
 * callers should gate on their own header config rather than calling blindly.
 * @param {number} transactionId
 */
export async function postRepairOrder(transactionId) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_ORDER_POST, {
    EntityId: transactionId,
  });
  return response.data;
}

/**
 * Repair orders available to raise an intake against.
 * @param {{ partyId?: number, take?: number, company_id?: number }} params
 * @returns {Promise<object[]>}
 */
export async function getRepairOrders({ partyId, take = 50, company_id } = {}) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_ORDER_LIST, {
    Take: take,
    party_id: partyId ?? undefined,
    company_id: company_id ?? undefined,
  });
  return response.data?.Entities ?? [];
}

/**
 * Full repair order including its line_items — the source for an intake.
 * @param {number} transactionId
 */
export async function getRepairOrderDetail(transactionId) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_ORDER_RETRIEVE, {
    EntityId: transactionId,
  });
  return response.data?.Entity ?? null;
}

/**
 * Projects a Repair Order line into the Repair In line the server expects.
 *
 * REWRITTEN 2026-09-17 — the previous version ("pass the line through
 * LARGELY INTACT... trimming to a hand-picked subset breaks Create") was
 * never actually verified live and turned out backwards: tested for real
 * against a genuine existing repair order on UAT (order 130, party 2221),
 * the full order line (even with item_components/item_operations/
 * check_list stripped, ~182 remaining fields) crashes RepairIn/Create with
 * an opaque 500 every time. A minimal, hand-picked line — item identity +
 * the ref_* linkage back to the order + weight/net_weight/pieces +
 * item_attribute_id/location_id — succeeded on 3 independent live Creates
 * (transaction_id 43, 44, 46), each followed by a real Cancel to confirm
 * the full lifecycle.
 *
 * Individually adding ANY ONE of karat_id/metal_id/item_group_id/type_id/
 * sub_type_id/base_item_id/base_item/hsn/tax_template_id (9/9 tried) OR
 * ANY of the financial fields (sub_total/net_amount/taxable_amount/
 * item_cost/item_rate/purity/pure_weight/tax_amount, tried together)
 * reproduced the same crash — a 100% failure rate across everything tried
 * beyond the minimal set, not one specific poison field. That pattern
 * suggests the server takes a genuinely different (and broken) code path
 * once ANY of these richer fields is present, most likely revalidating the
 * item's classification against master data rather than trusting item_id —
 * not something worth guessing further at per-field. The classification
 * OrnaVerse itself shows back on Retrieve/List for a real intake is very
 * likely resolved server-side from item_id at read time regardless of what
 * Create was given, the same way many denormalized display fields work
 * elsewhere in this API — so omitting them here isn't expected to lose
 * information, only to avoid the field set that's confirmed to crash.
 *
 * @param {object} orderLine — a line_items[] entry from getRepairOrderDetail()
 * @param {object} order     — the parent order entity
 */
export function mapOrderLineToRepairInLine(orderLine, order) {
  return {
    item_id:   orderLine.item_id,
    item_code: orderLine.item_code,
    item_name: orderLine.item_name,
    item_attribute_id: orderLine.item_attribute_id,
    location_id:       orderLine.location_id,
    weight:     orderLine.weight,
    net_weight: orderLine.net_weight,
    pieces:     orderLine.pieces,
    document_id: APP_CONFIG.DOCUMENT_TYPES.REPAIR_IN,
    party_id:    order.party_id,
    company_id:  order.company_id,
    financial_year_id: order.financial_year_id,
    // ← what makes this an intake AGAINST that order
    ref_document_id:         REPAIR_ORDER_DOCUMENT_ID,
    ref_transaction_id:      order.transaction_id,
    ref_transaction_item_id: orderLine.transaction_item_id,
  };
}

/**
 * Convenience: order + its lines, already projected for a Repair In.
 * @param {number} transactionId
 */
export async function getRepairOrderAsIntakeLines(transactionId) {
  const order = await getRepairOrderDetail(transactionId);
  if (!order) return { order: null, lines: [] };
  const lines = (order.line_items ?? []).map((l) => mapOrderLineToRepairInLine(l, order));
  return { order, lines };
}

/** document_id of the POS Repair In (see APP_CONFIG.DOCUMENT_TYPES.REPAIR_IN). */
const REPAIR_IN_DOCUMENT_ID = 117;

/**
 * Builds the RepairIn Entity from an order + its already-projected lines.
 *
 * document_id is REQUIRED at the header level, not just on each line item.
 * Everything else here is deliberately minimal — only party_id/company_id/
 * document_date/line_items are required beyond it.
 *
 * @param {{ order: object, lines: object[], documentDate?: string }} params
 */
export function buildRepairInPayload({ order, lines, documentDate }) {
  return {
    document_id:       REPAIR_IN_DOCUMENT_ID,
    party_id:          order.party_id,
    company_id:        order.company_id,
    financial_year_id: order.financial_year_id,
    document_date:     documentDate ?? order.document_date,
    line_items:        lines,
  };
}

/**
 * Paginated list of repair intake records.
 * @param {{ take?: number, skip?: number, company_id?: number }} params
 * @returns {Promise<object>} { Entities[], TotalCount }
 */
export async function getRepairIns({ take = 50, skip = 0, company_id } = {}) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_IN_LIST, {
    Take:       take,
    Skip:       skip,
    company_id: company_id ?? undefined,
  });
  return response.data;
}

/**
 * Full detail of a single repair intake.
 * @param {number} transactionId
 * @returns {Promise<object>} { Entity: RepairInRow }
 */
export async function getRepairInDetail(transactionId) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_IN_RETRIEVE, {
    EntityId: transactionId,
  });
  return response.data;
}

/**
 * Create a repair intake (customer drops item).
 * @param {object} repairInEntity — see buildRepairInPayload()
 *   Required: document_id, party_id, company_id, document_date, line_items[]
 * @returns {Promise<object>} SaveResponse { EntityId }
 *
 * NOTE: a header-only Create (empty line_items) succeeds; Create with a real
 * projected line item currently still 500s server-side, and the upstream
 * Inventory/Repair/Create this whole chain starts from 500s even on a bare
 * payload — so end-to-end creation is blocked upstream of this function
 * regardless. Needs OrnaVerse's team.
 */
export async function createRepairIn(repairInEntity) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_IN_CREATE, {
    Entity: repairInEntity,
  });
  return response.data;
}

/**
 * Post (finalise) a repair intake.
 * @param {number} transactionId
 * @returns {Promise<object>} PostResponse
 */
export async function postRepairIn(transactionId) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_IN_POST, {
    EntityId: transactionId,
  });
  return response.data;
}

/**
 * Cancel a repair intake.
 * @param {number} transactionId
 * @returns {Promise<object>} OrnaVerse response
 */
export async function cancelRepairIn(transactionId) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_IN_CANCEL, {
    EntityId: transactionId,
  });
  return response.data;
}

/**
 * Paginated list of repair-out records.
 * @param {{ take?: number, skip?: number, company_id?: number }} params
 * @returns {Promise<object>} { Entities[], TotalCount }
 */
export async function getRepairOuts({ take = 50, skip = 0, company_id } = {}) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_OUT_LIST, {
    Take:       take,
    Skip:       skip,
    company_id: company_id ?? undefined,
  });
  return response.data;
}

/**
 * Create a repair-out (send item to craftsman).
 * @param {object} repairOutEntity — RepairOutRow fields
 * @returns {Promise<object>} SaveResponse { EntityId }
 */
export async function createRepairOut(repairOutEntity) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_OUT_CREATE, {
    Entity: repairOutEntity,
  });
  return response.data;
}

/**
 * Post (finalise) a repair-out.
 * @param {number} transactionId
 * @returns {Promise<object>} PostResponse
 */
export async function postRepairOut(transactionId) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_OUT_POST, {
    EntityId: transactionId,
  });
  return response.data;
}

/**
 * Paginated list of repair invoices.
 * @param {{ take?: number, skip?: number, company_id?: number }} params
 * @returns {Promise<object>} { Entities[], TotalCount }
 */
export async function getRepairInvoices({ take = 50, skip = 0, company_id } = {}) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_INVOICE_LIST, {
    Take:       take,
    Skip:       skip,
    company_id: company_id ?? undefined,
  });
  return response.data;
}

/**
 * Full detail of a single repair invoice.
 * @param {number} transactionId
 * @returns {Promise<object>} { Entity: RepairInvoiceRow }
 */
export async function getRepairInvoiceDetail(transactionId) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_INVOICE_RETRIEVE, {
    EntityId: transactionId,
  });
  return response.data;
}

/**
 * Create a repair invoice (item ready, bill the customer).
 * @param {object} repairInvoiceEntity — RepairInvoiceRow fields
 * @returns {Promise<object>} SaveResponse { EntityId }
 */
export async function createRepairInvoice(repairInvoiceEntity) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_INVOICE_CREATE, {
    Entity: repairInvoiceEntity,
  });
  return response.data;
}

/**
 * Post (finalise) a repair invoice.
 * @param {number} transactionId
 * @returns {Promise<object>} PostResponse
 */
export async function postRepairInvoice(transactionId) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_INVOICE_POST, {
    EntityId: transactionId,
  });
  return response.data;
}

/**
 * Create a payment receipt against a repair invoice.
 * @param {object} receiptEntity — RepairInvoiceReceiptRow fields
 * @returns {Promise<object>} SaveResponse { EntityId }
 */
export async function createRepairInvoiceReceipt(receiptEntity) {
  const response = await axiosInstance.post(API.REPAIR.REPAIR_INVOICE_RECEIPT, {
    Entity: receiptEntity,
  });
  return response.data;
}

/**
 * Get customer's advance payments available for repair invoice.
 * @param {{ party_id: number, company_id: number }} params
 */
export async function getRepairInvoiceAdvances({ party_id, company_id }) {
  const response = await axiosInstance.post(
    API.REPAIR.REPAIR_INVOICE_HELPERS_GET_ADVANCES,
    { party_id, company_id }
  );
  return response.data;
}

/**
 * Get customer's scheme balance available for repair invoice.
 * @param {{ party_id: number, company_id: number }} params
 */
export async function getRepairInvoiceScheme({ party_id, company_id }) {
  const response = await axiosInstance.post(
    API.REPAIR.REPAIR_INVOICE_HELPERS_GET_SCHEME,
    { party_id, company_id }
  );
  return response.data;
}

/**
 * Get customer's credit note balance available for repair invoice.
 * @param {{ party_id: number, company_id: number }} params
 */
export async function getRepairInvoiceCreditNote({ party_id, company_id }) {
  const response = await axiosInstance.post(
    API.REPAIR.REPAIR_INVOICE_HELPERS_GET_CREDIT,
    { party_id, company_id }
  );
  return response.data;
}

/**
 * Get customer's exchange value available for repair invoice.
 * @param {{ party_id: number, company_id: number }} params
 */
export async function getRepairInvoiceExchange({ party_id, company_id }) {
  const response = await axiosInstance.post(
    API.REPAIR.REPAIR_INVOICE_HELPERS_GET_EXCHANGE,
    { party_id, company_id }
  );
  return response.data;
}
