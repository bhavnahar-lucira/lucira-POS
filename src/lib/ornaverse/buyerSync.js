// SERVER-ONLY. Shared logic behind both on-demand Buyers-module syncs:
//   - src/app/api/buyers/sync-store/[companyId]/route.js  — every Invoice/
//     Order/Return/Exchange/BuyBack for one store (powers the /buyers LIST
//     page, which otherwise has a chicken-and-egg problem: it can only show
//     customers that already have a Mongo record, so the first time a store
//     is opened there's nothing to click into and nothing ever gets synced).
//   - src/app/api/buyers/sync/[customerId]/route.js — every purchase AND
//     every post-sale outcome (return/exchange/buyback, plus a cancelled
//     order/return/etc — see documentStatus) for one customer across every
//     store (powers the /buyers/[customerId] detail page's own
//     freshen-on-load). This is what lets the Buyers module flag which
//     leads already gave an item back — worth skipping on a follow-up call —
//     versus a genuine repeat customer.
//
// Both call straight into OrnaVerse using the CURRENT request's own session
// cookie (getSessionFromRequest) — same direct-fetch-with-session pattern
// src/app/api/customers/sync/route.js already uses — so no manual cookie
// copy-paste is needed; it works for whichever store/customer the logged-in
// operator can already see.
//
// scripts/backfillBuyerPurchases.mjs duplicates the store-level half of this
// (List → Receipt-List fallback → Retrieve) rather than importing it,
// because a standalone .mjs script run with plain `node` can't resolve this
// app's `@/` path alias.

import { UPSTREAM } from '@/lib/ornaverse/upstream';
import { upsertPurchase } from '@/lib/mongo/buyerPurchases';
import API from '@/constants/apiEndpoints';

const CONCURRENCY = 5; // parallel Retrieve calls — gentle on OrnaVerse + Mongo

async function ornaversePost(path, body, session) {
  const headers = { 'Content-Type': 'application/json', Cookie: session.cookie };
  if (session.csrf) headers['X-CSRF-TOKEN'] = session.csrf;
  const res = await fetch(`${UPSTREAM}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status}`);
  return res.json();
}

async function getSalesPersonNames(companyIds, session, salesPersonIds) {
  const names = new Map();
  await Promise.all([...companyIds].map(async (companyId) => {
    try {
      const data = await ornaversePost(API.HR.EMPLOYEE_LIST, { Take: 5000, company_id: companyId }, session);
      for (const e of data?.Entities ?? []) names.set(e.employee_id, e.employee_name);
    } catch (error) {
      console.warn(`[buyerSync] employee list for company ${companyId} failed`, error.message);
    }
  }));
  // A sales person can be set up under another company than the store they sell at, so anyone still
  // unnamed is looked up once in the full employee list.
  if ([...salesPersonIds].some((id) => !names.has(id))) {
    try {
      const data = await ornaversePost(API.HR.EMPLOYEE_LIST, { Take: 5000 }, session);
      for (const e of data?.Entities ?? []) if (!names.has(e.employee_id)) names.set(e.employee_id, e.employee_name);
    } catch (error) {
      console.warn('[buyerSync] full employee list failed', error.message);
    }
  }
  return names;
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = [];
  let nextIndex = 0;
  async function runNext() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}

function shapeRecord(kind, entity, salesPersonNames) {
  const items = (entity.line_items ?? []).map((row) => ({
    item_id:     row.item_id != null ? String(row.item_id) : undefined,
    item_name:   row.item_name ?? undefined,
    item_size:   row.item_size_name ?? undefined,
    item_weight: row.net_weight ?? row.weight ?? undefined,
    price:       row.sub_total ?? row.item_rate ?? undefined,
    quantity:    row.pieces ?? 1,
  }));

  const promoByCode = new Map();
  for (const row of entity.promotion_details ?? []) {
    if (!row?.promotion_code) continue;
    const amount = Number(row.promotion_amount) || 0;
    const existing = promoByCode.get(row.promotion_code);
    if (existing) existing.amount += amount;
    else promoByCode.set(row.promotion_code, { code: row.promotion_code, name: row.promotion_name || row.promotion_code, amount });
  }

  const payments = (entity.receipt_details ?? []).map((p) => ({
    modeName: p.mode_name ?? null,
    amount:   p.amount ?? 0,
    refNo:    p.ref_no ?? null,
  }));

  return {
    customerId:      entity.party_id,
    customerName:    entity.party_name ?? null,
    customerMobile:  entity.mobile ?? null,
    customerEmail:   null,
    customerAddress: null,
    transactionId:   entity.transaction_id,
    documentType:    kind,
    documentNo:      entity.document_no ?? null,
    documentDate:    entity.document_date ?? new Date().toISOString(),
    companyId:       entity.company_id,
    storeName:       entity.company_name ?? null,
    salesPersonId:   entity.sales_person_id ?? null,
    salesPersonName: salesPersonNames.get(entity.sales_person_id) ?? null, // not resolvable from the retrieved entity alone
    items,
    promotions: [...promoByCode.values()],
    payments,
    totalAmount: entity.net_amount ?? null,
    // Same raw document_status every Retrieve call already returns — carried
    // through unchanged so the Buyers module can flag a cancelled order (or
    // a cancelled return/exchange/buyback) without a second lookup.
    documentStatus: entity.document_status ?? null,
    balanceAmount:  entity.balance_amount  ?? null,
    receiptAmount:  entity.receipt_amount  ?? null,
  };
}

async function upsertEntities(kind, entities, session) {
  const withSalesPerson = entities.filter((e) => e?.sales_person_id != null);
  const companyIds = new Set(withSalesPerson.map((e) => e.company_id));
  const salesPersonNames = await getSalesPersonNames(companyIds, session, new Set(withSalesPerson.map((e) => e.sales_person_id)));
  let synced = 0;
  for (const entity of entities) {
    if (entity?.party_id == null) continue; // guest sale — nothing to retarget
    await upsertPurchase(shapeRecord(kind, entity, salesPersonNames));
    synced += 1;
  }
  return synced;
}

// ── Store-level sync (every document for one company) ──────────────────────
// List's own rows do NOT carry line_items/promotion_details — confirmed
// live: every purchase synced via List alone came back with items:[] and
// promotions:[] (only receipt_details/payments were present). Retrieve is
// the only endpoint that returns the full document, so List (or, when it
// can't be trusted for this company, the Receipt List fallback — same
// src/services/crossStoreDocuments.js approach) is used ONLY to discover
// which transaction_ids belong to this store; every one of them is then
// Retrieved individually for the real record.

// Return/Exchange/Buyback have no InvoiceReceipt/List-style fallback (that
// fallback exists only because Invoice/Order List was once found unreliably
// scoped by company_id for one real tenant — never observed on these three)
// — RECEIPT_PATH is intentionally left without entries for them; see
// fetchStoreDocuments's own fallback branch, skipped when absent.
const LIST_PATH     = {
  order:    'Services/POS/Order/List',
  invoice:  'Services/POS/Invoice/List',
  return:   'Services/POS/Return/List',
  exchange: 'Services/POS/Exchange/List',
  buyback:  'Services/POS/BuyBack/List',
};
const RETRIEVE_PATH = {
  order:    'Services/POS/Order/Retrieve',
  invoice:  'Services/POS/Invoice/Retrieve',
  return:   'Services/POS/Return/Retrieve',
  exchange: 'Services/POS/Exchange/Retrieve',
  buyback:  'Services/POS/BuyBack/Retrieve',
};
const RECEIPT_PATH  = { order: 'Services/POS/OrderReceipt/List', invoice: 'Services/POS/InvoiceReceipt/List' };
const STORE_SYNC_KINDS = ['invoice', 'order', 'return', 'exchange', 'buyback'];

function groupReceiptsByTransaction(rows) {
  const byTx = new Map();
  for (const row of rows) {
    const key = row.transaction_id;
    const rowDateMs = row.document_date ? new Date(row.document_date).getTime() : 0;
    const existing = byTx.get(key);
    if (existing) {
      if (rowDateMs > existing.documentDateMs) existing.documentDateMs = rowDateMs;
    } else {
      byTx.set(key, { transactionId: key, documentDateMs: rowDateMs });
    }
  }
  return [...byTx.values()];
}

async function fetchStoreDocuments(kind, companyId, session) {
  const list = await ornaversePost(LIST_PATH[kind], { Take: 0, Skip: 0, company_id: companyId }, session);
  const entities = list?.Entities ?? [];
  const trustworthy = entities.filter((e) => e.company_id === companyId);

  let transactionIds;
  if (trustworthy.length > 0) {
    transactionIds = trustworthy.map((e) => e.transaction_id);
  } else if (RECEIPT_PATH[kind]) {
    const receiptPeek = await ornaversePost(RECEIPT_PATH[kind], { Take: 1, company_id: companyId }, session);
    if ((receiptPeek?.TotalCount ?? 0) === 0) return [];

    const receiptData = await ornaversePost(RECEIPT_PATH[kind], { Take: 0, company_id: companyId }, session);
    transactionIds = groupReceiptsByTransaction(receiptData?.Entities ?? []).map((g) => g.transactionId);
  } else {
    return [];
  }

  const retrieved = await runWithConcurrency(transactionIds, async (transactionId) => {
    try {
      const data = await ornaversePost(RETRIEVE_PATH[kind], { EntityId: transactionId }, session);
      return data?.Entity ?? null;
    } catch {
      return null;
    }
  }, CONCURRENCY);

  return retrieved.filter((e) => e && e.company_id === companyId);
}

/**
 * @returns {Promise<{
 *   invoicesSynced: number, ordersSynced: number,
 *   returnsSynced: number, exchangesSynced: number, buybacksSynced: number,
 * }>}
 */
export async function syncStorePurchases({ companyId, session }) {
  const entitiesByKind = await Promise.all(
    STORE_SYNC_KINDS.map((kind) => fetchStoreDocuments(kind, companyId, session)),
  );
  const syncedByKind = await Promise.all(
    STORE_SYNC_KINDS.map((kind, i) => upsertEntities(kind, entitiesByKind[i], session)),
  );
  const [invoicesSynced, ordersSynced, returnsSynced, exchangesSynced, buybacksSynced] = syncedByKind;
  return { invoicesSynced, ordersSynced, returnsSynced, exchangesSynced, buybacksSynced };
}

// ── Customer-level sync (every purchase for one party, across every store) ─
// GetPartyTransactions (same endpoint useCustomer360.js uses) is PARTY-scoped
// rather than store-scoped, so unlike the store-level path above it only
// ever returns a lean report row — the real record still needs a Retrieve.

function extractTransactionId(row) {
  return row?.transaction_id ?? row?.TransactionId ?? row?.id ?? null;
}

async function syncCustomerKind(kind, rows, session) {
  const entities = await runWithConcurrency(rows, async (row) => {
    const transactionId = extractTransactionId(row);
    if (transactionId == null) return null;
    try {
      const data = await ornaversePost(RETRIEVE_PATH[kind], { EntityId: transactionId }, session);
      return data?.Entity ?? null;
    } catch (err) {
      console.warn(`[buyerSync] ${kind} ${transactionId} failed`, err.message);
      return null;
    }
  }, CONCURRENCY);
  return upsertEntities(kind, entities.filter(Boolean), session);
}

/**
 * @returns {Promise<{
 *   invoicesSynced: number, ordersSynced: number,
 *   returnsSynced: number, exchangesSynced: number, buybacksSynced: number,
 * }>}
 */
export async function syncCustomerPurchases({ partyId, session }) {
  const tx = await ornaversePost(API.CUSTOMER_HISTORY.PARTY_TRANSACTIONS, { party_id: partyId }, session);

  // tx.Returns also carries this tenant's Credit Notes — confirmed
  // elsewhere (CreditNote/Retrieve on this tenant returns a full Return
  // entity, document_id 55; there is no separate Credit Note document
  // type here) — so no separate credit-note sync is needed.
  const [invoicesSynced, ordersSynced, returnsSynced, exchangesSynced, buybacksSynced] = await Promise.all([
    syncCustomerKind('invoice',  tx?.Invoices  ?? [], session),
    syncCustomerKind('order',    tx?.Orders    ?? [], session),
    syncCustomerKind('return',   tx?.Returns   ?? [], session),
    syncCustomerKind('exchange', tx?.Exchanges ?? [], session),
    syncCustomerKind('buyback',  tx?.BuyBacks  ?? [], session),
  ]);
  return { invoicesSynced, ordersSynced, returnsSynced, exchangesSynced, buybacksSynced };
}
