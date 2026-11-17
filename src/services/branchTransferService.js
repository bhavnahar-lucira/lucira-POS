// Branch Transfer, same flow as OrnaVerse's Transfer To Branch / Receive From Branch screens:
// sender creates + posts a Branch Out (doc 32) → OrnaVerse auto-creates a draft Branch In (doc 33)
// at the destination → the destination authorises it with a username + password (AuthorizeAndPost).

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import APP_CONFIG from '@/constants/appConfig';

const { BRANCH_TRANSFER: EP } = API;
const BRANCH_OUT = APP_CONFIG.DOCUMENT_TYPES.BRANCH_OUT;

const post = async (url, body) => (await axiosInstance.post(url, body)).data;

export async function getCompany(companyId) {
  return (await post(EP.COMPANY_RETRIEVE, { EntityId: companyId }))?.Entity ?? null;
}

/** Same lookup as OrnaVerse's branch PartySelectEditor: current_company_id is the sender's own party id. */
export async function getDestinations({ companyId, ownPartyId }) {
  const data = await post(EP.DESTINATIONS, {
    Sort: ['party_name'], ColumnSelection: 1, IncludeColumns: ['party_id', 'party_name'],
    company_id: companyId, current_company_id: ownPartyId, Skip: 0, Take: 0, party_sub_types: [1, 2],
  });
  return (data?.Entities ?? []).filter((p) => p.party_id !== ownPartyId);
}

export async function getParty(partyId) {
  return (await post(EP.PARTY_RETRIEVE, { EntityId: partyId }))?.Entity ?? null;
}

export async function getCompanyByParty(partyId) {
  return (await post(EP.COMPANY_LIST, { party_id: partyId }))?.Entities?.[0] ?? null;
}

export async function getCompanyLocations(companyId) {
  return (await post(EP.COMPANY_LOCATIONS, { company_id: companyId, current_user: true, Take: 0 }))?.Entities ?? [];
}

export async function getFreights() {
  return (await post(EP.FREIGHTS, { Sort: ['freight_code'], Take: 0 }))?.Entities ?? [];
}

/** OrnaVerse's GetPartyDetails rules: pricing context + tax flag for a destination party. */
export function buildPricingContext({ party, myCompany, docAllowsTax }) {
  const costPolicy = party.cost_policy ?? 1;
  const sameState = party.state_name === myCompany?.state_name;
  const isTaxApplicable = !!docAllowsTax && party.tax_reg_type != null && !sameState;
  const pricing = costPolicy === 1
    ? { price_list_id: 0, coef: 1, markup_policy_id: 0, stone_markup: 1, labour_markup: 1 }
    : { price_list_id: party.price_list_id ?? 0, coef: party.coef ?? 1, markup_policy_id: party.markup_policy_id ?? 0, stone_markup: party.stone_markup ?? 1, labour_markup: party.labour_markup ?? 1 };
  return { ...pricing, cost_policy: costPolicy, party_state: party.state_name, is_tax_applicable: isTaxApplicable };
}

/** The Stock picker of Transfer To Branch. base_item_id: 11 Jewellery, 12 Metal, 13 Stone, 14 Others. */
export async function listTransferStock({ salePartyId, baseItemId = 11, search }) {
  const data = await post(EP.STOCK, {
    Skip: 0, Take: 0, has_sku: true, enforce_huid_sale_policy: true,
    current_document_id: BRANCH_OUT, sale_party_id: salePartyId,
    EqualityFilter: { base_item_id: null }, base_item_id: String(baseItemId),
    ...(search ? { ContainsText: search } : {}),
  });
  return data?.Entities ?? [];
}

export async function priceTransferItems({ items, context }) {
  if (!items?.length) return [];
  const body = {
    selected_products: items, generate_line_no: false, generate_lot_no: false,
    price_list_id: context.price_list_id, stone_markup: context.stone_markup, labour_markup: context.labour_markup,
    calculate_rates: true, document_date: new Date().toUTCString(), exchange_rate: 1,
    party_state: context.party_state, document_id: BRANCH_OUT, is_purchase: false,
    is_tax_applicable: context.is_tax_applicable, coef: context.coef,
    cost_policy: context.cost_policy, markup_policy_id: context.markup_policy_id,
  };
  const url = context.price_list_id > 0 ? EP.PRICE_SALES : EP.PRICE_COST;
  if (context.price_list_id > 0) body.coef = 1; else body.price_list_id = 0;
  return (await post(url, body))?.Entities ?? [];
}

const round2 = (n) => +(Number(n) || 0).toFixed(2);
const sumOf = (rows, f) => round2(rows.reduce((s, r) => s + (Number(r[f]) || 0), 0));

/** Header totals the way OrnaVerse's dialog rolls them up from the lines. */
export function transferTotals(lines, isTaxApplicable) {
  const subTotal = sumOf(lines, 'sub_total');
  const taxAmount = sumOf(lines, 'tax_amount');
  const netAmount = sumOf(lines, 'net_amount');
  return {
    pieces: lines.reduce((s, r) => s + (Number(r.pieces) || 0), 0),
    weight: +lines.reduce((s, r) => s + (Number(r.weight) || 0), 0).toFixed(3),
    net_weight: +lines.reduce((s, r) => s + (Number(r.net_weight) || 0), 0).toFixed(3),
    sub_total: subTotal, discount: sumOf(lines, 'discount'),
    taxable_amount: isTaxApplicable ? sumOf(lines, 'taxable_amount') : 0,
    tax_amount: taxAmount, net_amount: netAmount, round_off: 0,
    base_sub_total: subTotal, base_tax_amount: taxAmount, base_net_amount: netAmount, base_round_off: 0,
  };
}

export async function createBranchOut({ companyId, headerConfig, party, context, locationId, freightId, awbNo, remark, address, lines }) {
  const entity = {
    document_id: BRANCH_OUT,
    document_date: new Date().toISOString(),
    company_id: companyId,
    financial_year_id: headerConfig.financialYearId,
    currency_id: party.currency_id ?? 103,
    exchange_rate: 1,
    party_id: party.party_id,
    party_name: party.party_name,
    location_id: locationId,
    freight_id: freightId || null,
    awb_no: awbNo || '',
    remark: remark || '',
    address: address || '',
    state_name: party.state_name,
    tax_no: party.tax_no,
    tax_reg_type: party.tax_reg_type,
    payable_ledger_id: party.payable_ledger_id,
    receivable_ledger_id: party.receivable_ledger_id,
    ledger_id: headerConfig.ledgerId,
    auto_posting: headerConfig.autoPosting,
    is_document_number_editable: headerConfig.isDocumentNumberEditable,
    number_of_backdated_days: headerConfig.numberOfBackdatedDays ?? 60,
    allow_backdated_entry: false,
    is_einvoice: false,
    is_tax_applicable: context.is_tax_applicable,
    cost_policy: context.cost_policy,
    coef: context.coef,
    price_list_id: context.price_list_id,
    markup_policy_id: context.markup_policy_id,
    stone_markup: context.stone_markup,
    labour_markup: context.labour_markup,
    ...transferTotals(lines, context.is_tax_applicable),
    line_items: lines,
  };
  return post(EP.OUT_CREATE, { Entity: entity });
}

export async function retrieveBranchOut(id) {
  return (await post(EP.OUT_RETRIEVE, { EntityId: id }))?.Entity ?? null;
}

/** The Branch In OrnaVerse created at the destination for this Branch Out (its authorize flag = received). */
export async function getLinkedBranchIn(branchOutId) {
  return (await post(EP.IN_LIST, { ref_transaction_id: branchOutId, ref_document_id: BRANCH_OUT }))?.Entities?.[0] ?? null;
}

export async function postBranchOut(id) {
  const entity = await retrieveBranchOut(id);
  return post(EP.OUT_POST, { EntityId: id, Entity: entity });
}

export async function cancelBranchOut(id) {
  const entity = await retrieveBranchOut(id);
  return post(EP.OUT_CANCEL, { EntityId: id, Entity: entity });
}

/** Receipts (Branch Ins) OrnaVerse created for sent transfers, keyed by the Branch Out id they came from. */
export async function listReceiptsBySentTransfer({ take = 300 } = {}) {
  const data = await post(EP.IN_LIST, { ref_document_id: BRANCH_OUT, Take: take, Sort: ['transaction_id DESC'] });
  const map = new Map();
  for (const r of data?.Entities ?? []) if (!map.has(r.ref_transaction_id)) map.set(r.ref_transaction_id, r);
  return map;
}

export async function listBranchOuts({ skip = 0, take = 50 } = {}) {
  const data = await post(EP.OUT_LIST, { Skip: skip, Take: take, Sort: ['transaction_id DESC'] });
  return { rows: data?.Entities ?? [], totalCount: data?.TotalCount ?? 0 };
}

export async function listBranchIns({ skip = 0, take = 50 } = {}) {
  const data = await post(EP.IN_LIST, { Skip: skip, Take: take, Sort: ['transaction_id DESC'] });
  return { rows: data?.Entities ?? [], totalCount: data?.TotalCount ?? 0 };
}

export async function retrieveBranchIn(id) {
  return (await post(EP.IN_RETRIEVE, { EntityId: id }))?.Entity ?? null;
}

/** Same request as OrnaVerse's Authorize popup on Receive From Branch. */
export async function authorizeBranchIn({ id, username, password }) {
  const entity = await retrieveBranchIn(id);
  return post(EP.IN_AUTHORIZE, { TransactionId: id, Entity: entity, Username: username, Password: password });
}
