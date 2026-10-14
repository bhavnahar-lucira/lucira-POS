// SERVER-ONLY. Shared logic behind both on-demand Buyers-module syncs:
//   - src/app/api/buyers/sync-store/[companyId]/route.js  — every Invoice/
//     Order for one store (powers the /buyers LIST page, which otherwise
//     has a chicken-and-egg problem: it can only show customers that already
//     have a Mongo record, so the first time a store is opened there's
//     nothing to click into and nothing ever gets synced).
//   - src/app/api/buyers/sync/[customerId]/route.js — every purchase for one
//     customer across every store (powers the /buyers/[customerId] detail
//     page's own freshen-on-load).
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

function shapeRecord(kind, entity) {
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
    salesPersonName: null, // not resolvable from the retrieved entity alone
    items,
    promotions: [...promoByCode.values()],
    payments,
    totalAmount: entity.net_amount ?? null,
  };
}

async function upsertEntities(kind, entities) {
  let synced = 0;
  for (const entity of entities) {
    if (entity?.party_id == null) continue; // guest sale — nothing to retarget
    await upsertPurchase(shapeRecord(kind, entity));
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

const LIST_PATH     = { order: 'Services/POS/Order/List',       invoice: 'Services/POS/Invoice/List' };
const RETRIEVE_PATH = { order: 'Services/POS/Order/Retrieve',    invoice: 'Services/POS/Invoice/Retrieve' };
const RECEIPT_PATH  = { order: 'Services/POS/OrderReceipt/List', invoice: 'Services/POS/InvoiceReceipt/List' };

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
  } else {
    const receiptPeek = await ornaversePost(RECEIPT_PATH[kind], { Take: 1, company_id: companyId }, session);
    if ((receiptPeek?.TotalCount ?? 0) === 0) return [];

    const receiptData = await ornaversePost(RECEIPT_PATH[kind], { Take: 0, company_id: companyId }, session);
    transactionIds = groupReceiptsByTransaction(receiptData?.Entities ?? []).map((g) => g.transactionId);
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

/** @returns {Promise<{ invoicesSynced: number, ordersSynced: number }>} */
export async function syncStorePurchases({ companyId, session }) {
  const [invoiceEntities, orderEntities] = await Promise.all([
    fetchStoreDocuments('invoice', companyId, session),
    fetchStoreDocuments('order',   companyId, session),
  ]);
  const [invoicesSynced, ordersSynced] = await Promise.all([
    upsertEntities('invoice', invoiceEntities),
    upsertEntities('order',   orderEntities),
  ]);
  return { invoicesSynced, ordersSynced };
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
  return upsertEntities(kind, entities.filter(Boolean));
}

/** @returns {Promise<{ invoicesSynced: number, ordersSynced: number }>} */
export async function syncCustomerPurchases({ partyId, session }) {
  const tx = await ornaversePost(API.CUSTOMER_HISTORY.PARTY_TRANSACTIONS, { party_id: partyId }, session);
  const invoiceRows = tx?.Invoices ?? [];
  const orderRows   = tx?.Orders   ?? [];

  const [invoicesSynced, ordersSynced] = await Promise.all([
    syncCustomerKind('invoice', invoiceRows, session),
    syncCustomerKind('order',   orderRows,   session),
  ]);
  return { invoicesSynced, ordersSynced };
}
