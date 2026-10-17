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
 *   transactionId: number, documentType: 'invoice'|'order',
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
        salesPersonName: record.salesPersonName ?? null,
        items:           record.items       ?? [],
        promotions:      record.promotions  ?? [],
        payments:        record.payments    ?? [],
        totalAmount:     record.totalAmount ?? 0,
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
