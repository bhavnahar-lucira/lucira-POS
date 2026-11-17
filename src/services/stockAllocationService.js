// Stock Allocation (doc 37), same flow as OrnaVerse's Inventory → Stock Allocation screen:
// order lines come from POS Orders / Sales Orders, each line gets stock pieces reserved via "Select Stock",
// and the voucher is saved with auto_posting when the operator may post.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import APP_CONFIG from '@/constants/appConfig';

const { STOCK_ALLOCATION: EP } = API;
const STOCK_ALLOCATION = APP_CONFIG.DOCUMENT_TYPES.STOCK_ALLOCATION;

const post = async (url, body) => (await axiosInstance.post(url, body)).data;

export async function listStockAllocations({ skip = 0, take = 50 } = {}) {
  const data = await post(EP.LIST, { Skip: skip, Take: take, Sort: ['transaction_id DESC'] });
  return { rows: data?.Entities ?? [], totalCount: data?.TotalCount ?? 0 };
}

export async function retrieveStockAllocation(id) {
  return (await post(EP.RETRIEVE, { EntityId: id }))?.Entity ?? null;
}

export async function listPosOrderLines(companyId) {
  return (await post(EP.POS_ORDER_LINES, { Take: 0, pieces: 1, company_id: companyId, document_status: 1 }))?.Entities ?? [];
}

export async function listSalesOrderLines() {
  return (await post(EP.SALES_ORDER_LINES, { Take: 0, validate_against_stock: false, pieces: 1, document_status: 1 }))?.Entities ?? [];
}

// OrnaVerse's setStockAllocationData: keep only the component fields a demand line carries.
function toDemandLine(row) {
  const components = (row.item_components ?? []).map((c) => ({
    rm_id: c.rm_id, rm_attribute_id: c.rm_attribute_id, amount: c.amount, rate: c.rate, uoc_id: c.uoc_id,
    certificate_no: c.certificate_no, pieces: c.pieces, weight: c.weight, pure_weight: c.pure_weight,
    purity: c.purity, item_id: c.item_id, lab_id: c.lab_id, ref_transaction_bom_id: c.rm_id,
    stone_status_id: c.stone_status_id, transaction_item_id: c.transaction_item_id, discount: 0, discount_percent: 0,
  }));
  const { item_operations: _ops, item_taxes: _taxes, ...rest } = structuredClone(row);
  return { ...rest, item_components: components, allocated_items: [], allocated_pieces: 0, allocated_weight: 0 };
}

/** Turns picked order lines into allocation lines, with the same SetReturnItems flags OrnaVerse uses per source. */
export async function buildDemandLines({ rows, source }) {
  if (!rows?.length) return [];
  const flags = source === 'sales'
    ? { generate_line_no: false, generate_lot_no: false, calculate_rates: false, is_labour_applicable: false, exchange_rate: 1, is_tax_applicable: false }
    : { generate_line_no: true, generate_lot_no: false, exchange_rate: 1, is_tax_applicable: false };
  const entities = (await post(EP.SET_ITEMS, { selected_products: rows, ...flags }))?.Entities ?? [];
  return (source === 'sales' ? entities.filter((e) => e.pieces === 1) : entities).map(toDemandLine);
}

/** "Select Stock" for one order line: unallocated pieces of the same item + attribute. */
export async function listAllocatableStock(line) {
  return (await post(EP.STOCK, {
    item_id: line.item_id, item_attribute_id: line.item_attribute_id, is_allocated: false, filter_items: 5, Take: 0,
  }))?.Entities ?? [];
}

export async function priceAllocatedStock(rows) {
  if (!rows?.length) return [];
  const entities = (await post(EP.SET_ITEMS, {
    selected_products: rows, is_labour_applicable: false, is_tax_applicable: false, document_id: STOCK_ALLOCATION,
  }))?.Entities ?? [];
  return entities.map(({ item_operations: _o, item_taxes: _t, final_amount: _f, discount_headroom_code: _d, ...rest }) => ({
    ...rest,
    item_components: (rest.item_components ?? []).map(({ transaction_item_id: _id, ...c }) => c),
  }));
}

export function allocationTotals(allocated) {
  return {
    allocated_pieces: allocated.reduce((s, r) => s + (Number(r.pieces) || 0), 0),
    allocated_weight: +allocated.reduce((s, r) => s + (Number(r.weight) || 0), 0).toFixed(3),
  };
}

const pad = (value, length) => String(value).padStart(length, '0');

/** Port of OrnaVerse's client-side document number builder — StockAllocation/Create requires document_no. */
export async function nextDocumentNo({ documentId, companyId, companyCode }) {
  const doc = (await post(EP.DOCUMENT_BY_ID, { document_id: documentId }))?.Entity;
  if (!doc) throw new Error('Document type not found.');
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
  const zeroes = doc.prefill_with_zero ? (doc.no_of_zeroes ?? 0) : 0;
  return `${prefix}${datePart}${pad(next, zeroes + String(next).length)}`;
}

/** OrnaVerse's Edit → Save: the retrieved allocation with its updated lines (a posted allocation can still be edited). */
export async function updateStockAllocation({ id, lines }) {
  const entity = await retrieveStockAllocation(id);
  if (!entity) throw new Error('Allocation not found.');
  return post(EP.UPDATE, { EntityId: id, Entity: { ...entity, line_items: lines } });
}

export async function postStockAllocation(id) {
  const entity = await retrieveStockAllocation(id);
  return post(EP.POST, { EntityId: id, Entity: entity });
}

export async function cancelStockAllocation(id) {
  const entity = await retrieveStockAllocation(id);
  return post(EP.CANCEL, { EntityId: id, Entity: entity });
}

export async function createStockAllocation({ companyId, companyCode, partyId, headerConfig, canPost, narration, lines }) {
  const entity = {
    document_no: await nextDocumentNo({ documentId: STOCK_ALLOCATION, companyId, companyCode }),
    company_id: companyId,
    financial_year_id: headerConfig.financialYearId,
    currency_id: 103,
    document_id: STOCK_ALLOCATION,
    document_date: new Date().toDateString(),
    is_tax_applicable: headerConfig.isTaxApplicable,
    party_id: partyId,
    exchange_rate: 1,
    narration: narration || '',
    ...(canPost ? { auto_posting: true } : {}),
    line_items: lines.map((l) => ({ ...l, financial_year_id: null })),
  };
  return post(EP.CREATE, { Entity: entity });
}
