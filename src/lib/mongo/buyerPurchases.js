// src/lib/mongo/buyerPurchases.js
//
// Customer purchase history — custom, independent of OrnaVerse (which has
// no cross-store, relationship-oriented view of its own). One document PER
// PURCHASE, not one per customer: keeps the write path a plain idempotent
// upsert (no $push-into-array races between the live checkout hook and the
// backfill script), and makes both real query shapes — "every purchase for
// this customer" and "every purchase at this store" — a plain indexed
// find()/aggregate(), never a nested-array scan.
//
// _id is derived from documentType+transactionId (see upsertPurchase) so a
// backfill re-run, or a retried live-capture POST, always overwrites the
// SAME document instead of creating a duplicate — the one piece of
// idempotency this whole module leans on.
//
// PAN (pan_no/pan_document) is deliberately never part of this record —
// same precedent as customerProfile.js, which already omits these from its
// own Mongo mirror. Not needed for retargeting, reduces exposure.

import { getDb } from './client';
import { ACTIVE_ENV } from '@/lib/ornaverse/environment';

const COLLECTION = 'buyerPurchases_POS';

// Confirmed live 2026-10-15: a UAT test order appeared under /buyers while
// running LIVE — this collection is one shared Mongo database across both
// OrnaVerse environments. Every record now carries which one it came from
// (stamped server-side by the route, never client-supplied), and every read
// here scopes to the CURRENT environment only. Records written before this
// fix have no `environment` field at all — those predate UAT/LIVE mixing
// ever being recorded, so they're treated as LIVE (the overwhelmingly
// likely case: real historical sales, not test data) rather than hidden.
function environmentMatch() {
  return ACTIVE_ENV === 'LIVE'
    ? { $or: [{ environment: 'LIVE' }, { environment: { $exists: false } }] }
    : { environment: 'UAT' };
}

function buildId({ documentType, transactionId }) {
  return `${documentType}-${transactionId}`;
}

/**
 * @param {{
 *   customerId: number, customerName?: string, customerMobile?: string,
 *   customerEmail?: string, customerAddress?: object,
 *   transactionId: number, documentType: 'invoice'|'order'|'return'|'exchange'|'buyback',
 *   documentNo?: string, documentDate: string|Date,
 *   companyId: number, storeName?: string,
 *   salesPersonId?: number, salesPersonName?: string,
 *   items: object[], promotions: object[], payments: object[],
 *   totalAmount: number,
 * }} record
 */
export async function upsertPurchase(record) {
  const db = await getDb();
  const _id = buildId(record);
  const documentDate = record.documentDate ? new Date(record.documentDate) : new Date();

  await db.collection(COLLECTION).updateOne(
    { _id },
    {
      $set: {
        customerId:      record.customerId,
        customerName:    record.customerName    ?? null,
        customerMobile:  record.customerMobile  ?? null,
        customerEmail:   record.customerEmail   ?? null,
        customerAddress: record.customerAddress ?? null,
        transactionId:   record.transactionId,
        documentType:    record.documentType,
        documentNo:      record.documentNo ?? null,
        documentDate,
        companyId:       record.companyId,
        environment:     record.environment ?? ACTIVE_ENV,
        storeName:       record.storeName ?? null,
        salesPersonId:   record.salesPersonId   ?? null,
        // Only written when known, so a sync without the name never wipes one saved at checkout.
        ...(record.salesPersonName != null && { salesPersonName: record.salesPersonName }),
        items:          record.items       ?? [],
        promotions:      record.promotions  ?? [],
        payments:        record.payments    ?? [],
        totalAmount:     record.totalAmount ?? 0,
        // documentStatus: 0 Draft / 1 Posted / 2 Cancelled — same raw
        // document_status every other list in this app already reads (see
        // deriveDocumentStatus, useCustomerOrders.js). balance/receipt are
        // stored alongside it so the UI can reuse that SAME shared precedence
        // helper instead of re-deriving "cancelled" with its own logic.
        // Lets the Buyers module flag "this lead cancelled/returned/
        // exchanged their purchase" — a signal for who's worth a follow-up
        // call and who isn't — without a second write path.
        documentStatus:  record.documentStatus ?? null,
        balanceAmount:   record.balanceAmount  ?? null,
        receiptAmount:   record.receiptAmount  ?? null,
        updatedAt:       new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
}

/**
 * Every raw purchase document for a scope, newest first — powers the
 * /buyers list page. Returned UNGROUPED (not one row per customer) so the
 * page can apply its date-range/document-type filters against the real
 * purchase-level data first, then group into buyer summary rows — grouping
 * ahead of time (e.g. a `$group` aggregation here) would bake in "lifetime"
 * totals that can't be re-sliced by a filter without a round trip per filter
 * combination.
 * @param {{ companyId?: number }} params — omit for every store (admin only;
 *   callers are responsible for only omitting this for an admin session).
 */
export async function listPurchases({ companyId } = {}) {
  const db = await getDb();
  const match = { ...environmentMatch(), ...(companyId != null ? { companyId } : {}) };
  return db.collection(COLLECTION).find(match).sort({ documentDate: -1 }).toArray();
}

/** One store's invoices and orders, only the fields the Non-Buyers matching needs. */
export async function listStoreSales(companyId) {
  const db = await getDb();
  return db.collection(COLLECTION)
    .find(
      { ...environmentMatch(), companyId, documentType: { $in: ['invoice', 'order'] } },
      {
        projection: {
          documentType: 1, documentNo: 1, documentDate: 1, documentStatus: 1,
          balanceAmount: 1, receiptAmount: 1, totalAmount: 1, customerName: 1, customerMobile: 1,
        },
      },
    )
    .toArray();
}

/**
 * Every purchase for one customer, newest first — powers the
 * /buyers/[customerId] detail page.
 */
export async function getBuyerHistory(customerId) {
  const db = await getDb();
  return db.collection(COLLECTION)
    .find({ customerId, ...environmentMatch() })
    .sort({ documentDate: -1 })
    .toArray();
}
