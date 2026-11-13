// Repairs, mirroring OrnaVerse's own flow:
//   store  Repair Order (REP, 75) ── Transfer to HO ──▶ HO Receipt From Store (REPI, 117, authorise)
//   HO     Return To Store (RPO, 118) ──▶ store Receipt From HO (REPIR, 120, authorise)
//   store  Repair Invoice (RIN, 119) — lines are the REP lines back in stock, billed for the repair charge.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import { localDocumentDate } from '@/lib/checkout/documentFields';

const EP = API.REPAIR;
const post = async (url, body) => (await axiosInstance.post(url, body)).data;

export const REPAIR_DOC = {
  ORDER: 75,
  RECEIPT_FROM_STORE: 117,
  RETURN_TO_STORE: 118,
  INVOICE: 119,
  RECEIPT_FROM_HO: 120,
};

export const REPAIR_TYPE = { STOCK_ITEM: 1, SOLD_ITEM: 2, CUSTOMER_ITEM: 3 };
export const REPAIR_LOCATION_TYPE = { WORKSHOP: 1, HEAD_OFFICE: 2 };

export const DOCUMENT_STATUS = { DRAFT: 0, POSTED: 1, CANCELLED: 2 };

const pad = (value, length) => String(value).padStart(length, '0');

/** Port of OrnaVerse's client document-number builder; repair Creates need document_no from the client. */
async function getDocumentDefinition(documentId) {
  const doc = (await post(EP.DOCUMENT_BY_ID, { document_id: documentId }))?.Entity;
  if (!doc) throw new Error('Document type not found.');
  return doc;
}

export async function nextDocumentNo({ documentId, companyId, companyCode, definition }) {
  const doc = definition ?? await getDocumentDefinition(documentId);
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const mm = pad(month, 2);
  const yy = String(now.getUTCFullYear()).slice(2);
  const yyyy = String(now.getUTCFullYear());
  const mon = now.toLocaleString('default', { month: 'short' }).toLocaleUpperCase();
  const fyYear = month < 4 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const rows = (await post(EP.DOCUMENT_NUMBERING, {
    document_id: documentId,
    current_month: doc.reset_monthly ? month : undefined,
    current_year: doc.reset_monthly ? now.getUTCFullYear() : fyYear,
    company_id: companyId,
  }))?.Entities ?? [];
  const last = rows.reduce((max, r) => Math.max(max, r.last_number ?? 0), 0);
  const sep = doc.separator ?? '';
  let prefix = doc.branch_wise ? `${companyCode ?? ''}${sep}` : '';
  if (doc.prefix) prefix = prefix ? `${prefix}${doc.prefix}${sep}` : `${doc.prefix}${sep}`;
  const datePart = {
    '[MM]/[YY]': `${mm}${sep}${yy}${sep}`,
    '[MM]/[YYYY]': `${mm}${sep}${yyyy}${sep}`,
    '[MON]/[YYYY]': `${mon}${sep}${yy}${sep}`,
    '[MM][YY]': `${mm}${yy}${sep}`,
    '[MM][YYYY]': `${mm}${yyyy}${sep}`,
    '[MON][YYYY]': `${mon}${yy}${sep}`,
    '[YY]': `${yy}${sep}`,
    '[YYYY]': `${yyyy}${sep}`,
    '[YYYY][MM]': `${yyyy}${mm}`,
    '[YY][MM]': `${yy}${mm}`,
  }[doc.prefix_date] ?? '';
  const next = last === 0 ? 1 : last + (doc.increment_by ?? 0);
  const width = doc.prefill_with_zero ? (doc.no_of_zeroes ?? 0) : 0;
  return `${prefix}${datePart}${pad(next, width)}`;
}

function listBody({ take = 50, skip = 0, partyId } = {}) {
  return {
    Take: take,
    Skip: skip,
    Sort: ['transaction_id DESC'],
    ...(partyId ? { EqualityFilter: { party_id: partyId } } : {}),
  };
}

const listOf = (url) => async (params) => {
  const data = await post(url, listBody(params));
  return { items: data?.Entities ?? [], total: data?.TotalCount ?? 0 };
};
const retrieveOf = (url) => async (id) => (await post(url, { EntityId: id }))?.Entity ?? null;

export const listRepairOrders = listOf(EP.REPAIR_ORDER_LIST);
export const retrieveRepairOrder = retrieveOf(EP.REPAIR_ORDER_RETRIEVE);
export const listRepairReceipts = listOf(EP.REPAIR_RECEIPT_LIST);
export const retrieveRepairReceipt = retrieveOf(EP.REPAIR_RECEIPT_RETRIEVE);
export const listRepairInvoices = listOf(EP.REPAIR_INVOICE_LIST);
export const retrieveRepairInvoice = retrieveOf(EP.REPAIR_INVOICE_RETRIEVE);
export const listRepairIns = listOf(EP.REPAIR_IN_LIST);
export const retrieveRepairIn = retrieveOf(EP.REPAIR_IN_RETRIEVE);
export const listRepairOuts = listOf(EP.REPAIR_OUT_LIST);
export const retrieveRepairOut = retrieveOf(EP.REPAIR_OUT_RETRIEVE);

/** Repair-order ids already billed on a (non-cancelled) repair invoice at this store. */
export async function getBilledRepairOrderIds() {
  const { items } = await listRepairInvoices({ take: 500 });
  const live = items.filter((inv) => inv.document_status !== DOCUMENT_STATUS.CANCELLED);
  const docs = await Promise.all(live.map((inv) => retrieveRepairInvoice(inv.transaction_id).catch(() => null)));
  const billed = new Map();
  for (const doc of docs) {
    for (const line of doc?.line_items ?? []) {
      if (line.ref_document_id === REPAIR_DOC.ORDER && line.ref_transaction_id) {
        billed.set(line.ref_transaction_id, doc.document_no);
      }
    }
  }
  return billed;
}

// ─── Repair Order (REP) ──────────────────────────────────────────────────────

/** Sold items the customer can bring in, from any branch (OrnaVerse's Sold Items picker). */
export async function getRepairableSoldItems({ partyId, take = 50 }) {
  if (!partyId) return [];
  const data = await post(EP.REPAIR_SOLD_ITEMS, {
    Take: take,
    party_id: partyId,
    company_id: null,
    transaction_type: 3,
    get_child: true,
  });
  const seen = new Set();
  return (data?.Entities ?? []).filter((row) => {
    if (row.base_item_id !== 11) return true;
    const key = `${row.sku}-${row.item_line_no}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function priceRepairOrderLines({ selectedProducts, companyId }) {
  const data = await post(API.HELPERS.SET_RETURN_ITEMS, {
    selected_products: selectedProducts,
    is_labour_applicable: false,
    is_tax_applicable: false,
    document_id: REPAIR_DOC.ORDER,
    exchange_rate: 1,
    company_id: companyId,
  });
  return (data?.Entities ?? []).map((line) => ({ ...line, document_id: REPAIR_DOC.ORDER }));
}

/** Designs from the item master, for a piece the customer brings in that isn't on any of their bills. */
export async function searchItemMaster(text, take = 30) {
  const q = text?.trim();
  if (!q || q.length < 3) return [];
  const data = await post(EP.ITEM_MASTER_LIST, { Take: take, base_item_id: 11, ContainsText: q });
  return data?.Entities ?? [];
}

/** Port of OrnaVerse's masterItemToCreditLine: an item-master design as a zero-value customer line. */
export function masterItemToRepairProduct(item, { pieces, netWeight } = {}) {
  const metalCount = (item.item_components ?? []).filter((c) => c.base_item_id === 12).length;
  const metalWeight = (c) => (c.base_item_id === 12 && netWeight > 0 && metalCount === 1 ? netWeight : c.weight);
  const components = item.is_bom ? (item.item_components ?? []).map((c) => ({
    item_id: c.item_id, item_code: c.item_code, rm_id: c.rm_id, rm_attribute_id: c.rm_attribute_id,
    rate: 0, amount: 0, base_amount: 0, uoc_id: c.uoc_id, uom_id: c.uom_id, pieces: c.pieces, weight: metalWeight(c),
    base_item_id: c.base_item_id, item_group_id: c.item_group_id, type_id: c.type_id, sub_type_id: c.sub_type_id,
    karat_id: c.karat_id, metal_color_id: c.metal_color_id, certificate_no: c.certificate_no, purity: c.purity,
    pure_weight: c.pure_weight, ref_transaction_bom_id: 0, is_customer_item: true,
    purchase_costing_id: c.purchase_costing_id, sales_costing_id: c.sales_costing_id, setting_id: 0, parts: 0,
    stone_status_id: 1, is_center_stone: c.is_center_stone, discount: 0, discount_percent: 0, markup: 0,
    pointer_weight: c.pointer_weight, shape_id: c.shape_id, stone_color_id: c.stone_color_id,
    quality_id: c.quality_id, sieve_id: c.sieve_id, stone_size_id: c.stone_size_id,
  })) : [];
  return {
    item_id: item.item_id, item_attribute_id: item.item_attribute_id, attribute: item.attribute, sku: item.sku,
    item_code: item.item_code, item_name: item.item_name, base_item_id: item.base_item_id, is_bom: item.is_bom,
    type_id: item.type_id, type_name: item.type_name, item_group_id: item.item_group_id,
    item_group_name: item.item_group_name, sub_type_id: item.sub_type_id, sub_type_name: item.sub_type_name,
    brand_id: item.brand_id, super_type_id: item.super_type_id, collection_id: item.collection_id,
    item_size_id: item.item_size_id, item_rate: 0, item_labour: 0, item_cost: 0,
    pieces: pieces ?? item.pieces, weight: item.weight, net_weight: netWeight || item.net_weight,
    other_pieces: item.other_pieces, other_weight: item.other_weight, stone_pieces: item.stone_pieces,
    stone_weight: item.stone_weight, sub_total: 0, net_amount: 0, diamond_pieces: item.diamond_pieces,
    diamond_weight: item.diamond_weight, color_stone_pieces: item.color_stone_pieces,
    color_stone_weight: item.color_stone_weight, uoc_id: item.uoc_id, item_components: components, hsn: item.hsn,
    tax_template_id: item.tax_template_id, metal_id: item.metal_id, karat_id: item.karat_id,
    metal_color_id: item.metal_color_id, quality_id: item.quality_id, sieve_id: item.sieve_id,
    shape_id: item.shape_id, stone_color_id: item.stone_color_id, stone_size_id: item.stone_size_id,
    image: item.image, is_finished: false, cut_id: item.cut_id, polish_id: item.polish_id,
    symmetry_id: item.symmetry_id, fluorescence_id: item.fluorescence_id, culet_id: item.culet_id,
    girdle_id: item.girdle_id, table: item.table, depth: item.depth, purity: item.purity ?? 0, pure_weight: 0,
    ref_document_id: 0, ref_transaction_id: 0, ref_transaction_item_id: 0, base_net_amount: 0, base_sub_total: 0,
    lot_no: '', bag_no: '', certificate_no: '', parts: item.parts, style_id: item.style_id, item_taxes: null,
    tax_amount: 0, base_tax_amount: 0, mf: 0, mf_amount: 0, export_pieces: 0,
    is_configurable: item.is_configurable, is_solitaire: item.is_solitaire, diamond_amount: 0,
    color_stone_amount: 0, stone_amount: 0, metal_amount: 0, stone_rate: 0, other_rate: 0, other_amount: 0,
    uom_id: item.uom_id, discount: 0, discount_percent: 0, purchase_costing_id: item.purchase_costing_id,
    sales_costing_id: item.sales_costing_id, stock_ledger_id: item.stock_ledger_id,
    wip_ledger_id: item.wip_ledger_id, loss_ledger_id: item.loss_ledger_id, narration: item.narration,
    stamp_id: item.stamp_id, color_quality_id: item.color_quality_id, other_charges: 0,
    pointer_weight: item.pointer_weight,
  };
}

export async function priceCustomerItemLines({ products, companyId }) {
  const lines = await priceRepairOrderLines({ selectedProducts: products, companyId });
  return lines.map((line) => ({
    ...line,
    item_components: (line.item_components ?? []).map((c) => ({ ...c, is_customer_item: true })),
  }));
}

/** Workshop repairs stay in this store; Head Office repairs are booked against the parent company. */
export async function resolveRepairLocation(companyId, locationType) {
  if (locationType !== REPAIR_LOCATION_TYPE.HEAD_OFFICE) return companyId;
  const company = (await post(EP.COMPANY_RETRIEVE, { EntityId: companyId }))?.Entity;
  return company?.parent_company ?? null;
}

export async function listRepairStockLocations(repairCompanyId) {
  if (!repairCompanyId) return [];
  const data = await post(EP.COMPANY_LOCATIONS, {
    company_id: repairCompanyId,
    is_repair_location: true,
    current_user: true,
    Take: 20,
  });
  return (data?.Entities ?? []).filter((l) => l.location_id > 0);
}

function omit(obj, ...keys) {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

function prepareLinesForSave(lines, documentId) {
  return lines.map((line) => ({
    ...omit(line, 'transaction_item_id'),
    document_id: documentId,
    item_components: (line.item_components ?? []).map((c) => omit(c, 'transaction_item_bom_id', 'transaction_bom_id')),
    item_operations: (line.item_operations ?? []).map((o) => omit(o, 'transaction_item_labour_id', 'transaction_labour_id')),
    item_taxes: (line.item_taxes ?? []).map((t) => omit(t, 'transaction_item_tax_id', 'transaction_tax_id')),
  }));
}

/** OrnaVerse's own retail-line rounding: net = round(Σ line nets), round_off = the difference. */
export function aggregateLineTotals(lines) {
  let subTotal = 0; let exact = 0; let discount = 0; let tax = 0; let pieces = 0; let weight = 0; let netWeight = 0;
  for (const l of lines) {
    const lineTax = Number(l.tax_amount) || 0;
    const taxable = l.taxable_amount ?? Math.max(0, (Number(l.sub_total) || 0) - (Number(l.discount) || 0));
    subTotal += Number(l.sub_total) || 0;
    exact += Math.round((Number(taxable) + lineTax) * 100) / 100;
    discount += Number(l.discount) || 0;
    tax += lineTax;
    pieces += Number(l.pieces) || 0;
    weight += Number(l.weight) || 0;
    netWeight += Number(l.net_weight) || 0;
  }
  const net = Math.round(exact);
  return {
    sub_total: +subTotal.toFixed(2),
    net_amount: net,
    round_off: +(net - exact).toFixed(2),
    discount: +discount.toFixed(2),
    tax_amount: +tax.toFixed(2),
    pieces,
    weight: +weight.toFixed(3),
    net_weight: +netWeight.toFixed(3),
  };
}

/** OrnaVerse's document header: number and posting flags from the document definition, year from the store config. */
async function documentHeader({ documentId, companyId, companyCode, headerConfig }) {
  const definition = await getDocumentDefinition(documentId);
  return {
    document_no: await nextDocumentNo({ documentId, companyId, companyCode, definition }),
    document_id: documentId,
    financial_year_id: headerConfig.financialYearId,
    company_id: companyId,
    currency_id: 103,
    exchange_rate: 1,
    document_date: localDocumentDate(),
    is_einvoice: definition.is_einvoice ?? false,
    auto_posting: (definition.auto_posting ?? headerConfig.autoPosting) !== false,
    is_tax_applicable: definition.is_tax_applicable ?? headerConfig.isTaxApplicable,
    number_of_backdated_days: definition.number_of_backdated_days ?? headerConfig.numberOfBackdatedDays ?? 0,
    allow_backdated_entry: definition.allow_backdated_entry ?? true,
    ledger_id: definition.ledger_id ?? headerConfig.ledgerId,
    user_id: null,
    is_document_number_editable: definition.is_document_number_editable ?? false,
  };
}

export async function buildRepairOrderEntity({
  companyId, companyCode, headerConfig, customer, repairType, repairLocationType,
  repairLocation, locationId, lines, narration,
}) {
  const lineItems = prepareLinesForSave(lines, REPAIR_DOC.ORDER);
  const totals = aggregateLineTotals(lineItems);
  return {
    ...(await documentHeader({ documentId: REPAIR_DOC.ORDER, companyId, companyCode, headerConfig })),
    party_id: customer.partyId,
    party_name: customer.name ?? '',
    repair_type: repairType,
    repair_location_type: repairLocationType,
    repair_location: repairLocation,
    location_id: locationId,
    line_items: lineItems,
    pieces: totals.pieces,
    weight: totals.weight,
    net_weight: totals.net_weight,
    sub_total: totals.sub_total,
    net_amount: totals.net_amount,
    round_off: totals.round_off,
    discount: totals.discount,
    tax_amount: totals.tax_amount,
    narration: narration ?? '',
    is_transferred: false,
  };
}

export async function createRepairOrder(entity) {
  return post(EP.REPAIR_ORDER_CREATE, { Entity: entity });
}

export async function transferRepairOrderToHO(transactionId) {
  return post(EP.REPAIR_ORDER_TRANSFER, { transaction_id: transactionId });
}

export async function recallRepairOrderTransfer(transactionId) {
  return post(EP.REPAIR_ORDER_RECALL, { transaction_id: transactionId });
}

// ─── Authorise (Receipt From Store at HO, Receipt From HO at the store) ─────

async function authorizeAndPost(url, retrieve, { id, username, password }) {
  const entity = await retrieve(id);
  if (!entity) throw new Error('Document not found.');
  return post(url, { TransactionId: id, Entity: entity, Username: username, Password: password });
}

export const authorizeRepairReceipt = (args) => authorizeAndPost(EP.REPAIR_RECEIPT_AUTHORIZE, retrieveRepairReceipt, args);
export const authorizeRepairIn = (args) => authorizeAndPost(EP.REPAIR_IN_AUTHORIZE, retrieveRepairIn, args);

// ─── Repair Invoice (RIN) ────────────────────────────────────────────────────

/** Repaired pieces back in this store for the customer, ready to bill (OrnaVerse's "Add Repaired Items"). */
export async function getRepairedItemsReadyForBilling({ partyId, companyId }) {
  if (!partyId || !companyId) return [];
  const data = await post(EP.REPAIRED_ITEMS, {
    Take: 50,
    party_id: partyId,
    company_id: companyId,
    document_id: REPAIR_DOC.RECEIPT_FROM_HO,
  });
  return data?.Entities ?? [];
}

export async function priceRepairInvoiceLines({ selectedProducts, partyId }) {
  const data = await post(EP.REPAIRED_ITEMS_PRICE, {
    selected_products: selectedProducts,
    generate_line_no: true,
    generate_lot_no: false,
    document_date: new Date().toDateString(),
    exchange_rate: 1,
    is_tax_applicable: true,
    calculate_rates: true,
    document_id: REPAIR_DOC.INVOICE,
    party_id: partyId,
  });
  return data?.Entities ?? [];
}

const MAKING_CHARGES_OPERATION_ID = 1;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * A repair invoice line bills only the repair charge (as the Making Charges operation) plus its tax;
 * the piece's metal and stone value is the customer's own and is not charged again.
 */
export function applyRepairCharge(line, charge) {
  const amount = round2(Math.max(0, Number(charge) || 0));
  const chargeWeight = Number(line.net_weight) || Number(line.weight) || 0;
  const ops = line.item_operations ?? [];
  const template = ops.find((o) => o.operation_id === MAKING_CHARGES_OPERATION_ID) ?? ops[0] ?? {
    operation_id: MAKING_CHARGES_OPERATION_ID,
    operation_name: 'Making Charges',
    item_group_id: line.item_group_id,
    base_item_id: line.base_item_id,
    pieces: line.pieces ?? 1,
    parts: 1,
    uoc_id: 62,
    labour_rate_type: 1,
    markup: 1,
    calculate_to: 1,
  };
  const operation = {
    ...template,
    weight: chargeWeight,
    rate: chargeWeight ? round2(amount / chargeWeight) : amount,
    amount,
    base_amount: amount,
    discount: 0,
    discount_percent: 0,
  };
  const taxes = (line.item_taxes ?? []).map((t) => {
    const taxAmount = round2((amount * (Number(t.tax_rate) || 0)) / 100);
    return { ...t, taxable_amount: amount, tax_amount: taxAmount, base_tax_amount: taxAmount };
  });
  const taxAmount = round2(taxes.reduce((s, t) => s + t.tax_amount, 0));
  return {
    ...line,
    metal_amount: 0,
    diamond_amount: 0,
    stone_amount: 0,
    color_stone_amount: 0,
    other_amount: 0,
    item_rate: 0,
    item_labour: amount,
    discount: 0,
    discount_percent: 0,
    item_operations: [operation],
    item_taxes: taxes,
    sub_total: amount,
    base_sub_total: amount,
    taxable_amount: amount,
    tax_amount: taxAmount,
    base_tax_amount: taxAmount,
    net_amount: round2(amount + taxAmount),
    base_net_amount: round2(amount + taxAmount),
  };
}

/** OrnaVerse books a repair invoice against the customer's own ledgers. */
export async function getPartyLedgers(partyId) {
  const customer = (await post(EP.CUSTOMER_RETRIEVE, { EntityId: partyId }))?.Entity;
  const payable = customer?.payable_ledger_id;
  const receivable = customer?.receivable_ledger_id;
  if (!(payable > 0) || !(receivable > 0)) {
    throw new Error("This customer has no ledger in OrnaVerse yet — open the customer once in OrnaVerse, then retry.");
  }
  return { payable_ledger_id: payable, receivable_ledger_id: receivable };
}

export async function buildRepairInvoiceEntity({
  companyId, companyCode, headerConfig, customer, salesPersonId, lines, receiptDetails, narration,
}) {
  const lineItems = prepareLinesForSave(lines, REPAIR_DOC.INVOICE)
    .map((l) => ({ ...l, sales_person_id: salesPersonId }));
  const totals = aggregateLineTotals(lineItems);
  const ledgers = await getPartyLedgers(customer.partyId);
  const receiptAmount = round2((receiptDetails ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const header = await documentHeader({ documentId: REPAIR_DOC.INVOICE, companyId, companyCode, headerConfig });
  return {
    ...header,
    ...ledgers,
    party_id: customer.partyId,
    party_name: customer.name ?? '',
    mobile: customer.mobile ?? undefined,
    sales_person_id: salesPersonId,
    line_items: lineItems,
    receipt_details: receiptDetails ?? [],
    pieces: totals.pieces,
    weight: totals.weight,
    net_weight: totals.net_weight,
    sub_total: totals.sub_total,
    net_amount: totals.net_amount,
    round_off: totals.round_off,
    discount: totals.discount,
    tax_amount: totals.tax_amount,
    taxable_amount: header.is_tax_applicable ? round2(totals.sub_total - totals.discount) : undefined,
    base_sub_total: totals.sub_total,
    base_net_amount: totals.net_amount,
    base_tax_amount: totals.tax_amount,
    receipt_amount: receiptAmount,
    balance_amount: Math.max(0, round2(totals.net_amount - receiptAmount)),
    narration: narration ?? '',
  };
}

export async function createRepairInvoice(entity) {
  return post(EP.REPAIR_INVOICE_CREATE, { Entity: entity });
}

// ─── Return To Store (RPO, HO only) ──────────────────────────────────────────

/** Stores Head Office can return repaired pieces to: every company with its own party, except HO itself. */
export async function listReturnDestinations(currentCompanyId) {
  const data = await post(EP.COMPANY_LIST, { Take: 200 });
  return (data?.Entities ?? [])
    .filter((c) => c.party_id && c.company_id !== currentCompanyId)
    .map((c) => ({
      companyId: c.company_id,
      companyCode: c.company_code,
      partyId: c.party_id,
      name: c.mailing_name ?? c.company_name ?? c.company_code,
    }));
}

/** Pieces received from that store (Receipt From Store) and not yet returned. */
export async function listPendingReturnItems(partyId) {
  if (!partyId) return [];
  const data = await post(EP.REPAIR_IN_ITEMS, { Take: 200, party_id: partyId });
  return data?.Entities ?? [];
}

export async function listCompanyLocations(companyId) {
  if (!companyId) return [];
  const data = await post(EP.COMPANY_LOCATIONS, { company_id: companyId, Take: 50 });
  return (data?.Entities ?? []).filter((l) => l.location_id > 0);
}

/** Same line OrnaVerse's Return To Store item dialog builds from a received bag. */
async function receivedItemToReturnLine(row, { companyId, financialYearId }) {
  const bom = row.bag_no
    ? (await post(EP.BAG_BOM, { bag_no: row.bag_no }))?.Entities ?? []
    : row.item_components ?? [];
  return {
    lot_no: row.lot_no, bag_no: row.bag_no, location_id: row.location_id, pieces: row.pieces,
    item_id: row.item_id, item_group_name: row.item_group_name, base_item_id: row.base_item_id,
    item_group_id: row.item_group_id, item_line_no: row.item_line_no, item_attribute_id: row.item_attribute_id,
    item_code: row.item_code, item_name: row.item_name, item_size_id: row.item_size_id, weight: row.weight,
    net_weight: row.net_weight, purity: row.purity, pure_weight: row.pure_weight,
    company_id: companyId, financial_year_id: financialYearId,
    ref_document_id: row.document_id, ref_transaction_id: row.transaction_id,
    ref_transaction_item_id: row.transaction_item_id, order_type_id: row.order_type_id, order_id: row.order_id,
    bag_status_id: row.bag_status_id, diamond_pieces: row.diamond_pieces, diamond_weight: row.diamond_weight,
    color_stone_pieces: row.color_stone_pieces, color_stone_weight: row.color_stone_weight,
    stone_pieces: row.stone_pieces, stone_weight: row.stone_weight, other_pieces: row.other_pieces,
    other_weight: row.other_weight, parts: row.parts, sku: row.sku, sub_bag_no: row.sub_bag_no,
    tree_id: row.tree_id ?? 0, tree_item_id: row.tree_item_id ?? 0, tree_no: row.tree_no,
    color_quality_id: row.color_quality_id, purchase_costing_id: row.purchase_costing_id,
    sales_costing_id: row.sales_costing_id, style_id: row.style_id, certificate_no: row.certificate_no,
    huid: row.huid, supplier_batch: row.supplier_batch, supplier_style: row.supplier_style,
    stamp_id: row.stamp_id, ref_no: row.ref_no, lab_id: row.lab_id, is_bom: row.is_bom,
    document_id: REPAIR_DOC.RETURN_TO_STORE,
    item_rate: 0, item_labour: 0, item_cost: 0, sub_total: 0, net_amount: 0, tax_amount: 0, discount: 0,
    item_components: bom.map((c) => omit(c, 'transaction_item_id', 'transaction_bom_id', 'transaction_item_bom_id')),
    item_operations: [],
    item_taxes: [],
  };
}

export async function buildReturnToStoreEntity({
  companyId, companyCode, headerConfig, destination, locationId, items, narration,
}) {
  const party = (await post(EP.PARTY_RETRIEVE, { EntityId: destination.partyId }))?.Entity;
  if (!party) throw new Error('Store party not found in OrnaVerse.');
  const header = await documentHeader({ documentId: REPAIR_DOC.RETURN_TO_STORE, companyId, companyCode, headerConfig });
  const lineItems = await Promise.all(items.map((row) => receivedItemToReturnLine(row, {
    companyId, financialYearId: header.financial_year_id,
  })));
  const totals = aggregateLineTotals(lineItems);
  return {
    ...header,
    party_id: party.party_id,
    party_name: party.party_name,
    state_name: party.state_name,
    payable_ledger_id: party.payable_ledger_id,
    receivable_ledger_id: party.receivable_ledger_id,
    tax_reg_type: party.tax_reg_type,
    tax_no: party.tax_no,
    location_id: locationId,
    cost_policy: 1,
    coef: 1,
    stone_markup: 1,
    labour_markup: 1,
    line_items: lineItems,
    pieces: totals.pieces,
    weight: totals.weight,
    net_weight: totals.net_weight,
    sub_total: totals.sub_total,
    net_amount: totals.sub_total,
    base_sub_total: totals.sub_total,
    base_net_amount: totals.sub_total,
    discount: totals.discount,
    tax_amount: 0,
    round_off: 0,
    narration: narration ?? '',
  };
}

export async function createReturnToStore(entity) {
  return post(EP.REPAIR_OUT_CREATE, { Entity: entity });
}

export async function getRepairInvoiceAdvances({ party_id, company_id }) {
  return post(EP.REPAIR_INVOICE_HELPERS_GET_ADVANCES, { party_id, company_id });
}

export async function getRepairInvoiceScheme({ party_id, company_id }) {
  return post(EP.REPAIR_INVOICE_HELPERS_GET_SCHEME, { party_id, company_id });
}

export async function getRepairInvoiceCreditNote({ party_id, company_id }) {
  return post(EP.REPAIR_INVOICE_HELPERS_GET_CREDIT, { party_id, company_id });
}

export async function getRepairInvoiceExchange({ party_id, company_id }) {
  return post(EP.REPAIR_INVOICE_HELPERS_GET_EXCHANGE, { party_id, company_id });
}
