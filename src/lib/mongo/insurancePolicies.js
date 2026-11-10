// Olocker policies issued against POS invoices.
//
// Olocker has no "list my policies" endpoint, so a policy that isn't
// recorded here is effectively lost — the operator would have no way back
// to the certificate URL, and re-pressing the button would double-insure
// the line. This collection is the only record, which is why the write
// happens before the route answers and why `insureLineItems` refuses lines
// that already carry a policy.

import { getDb } from './client';

const COLLECTION = 'insurancePolicies_POS';

/** One document per invoice per environment — UAT and LIVE never share rows. */
function filterFor(env, transactionId) {
  return { env, transaction_id: Number(transactionId) };
}

/**
 * @param {{ env: string, transactionId: number }} params
 * @returns {Promise<{ items: object[], document_no: string|null, unattributed: boolean, unattributedReason: string|null }>}
 */
export async function getInvoicePolicies({ env, transactionId }) {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne(filterFor(env, transactionId));
  return {
    items:        doc?.items ?? [],
    document_no:  doc?.document_no ?? null,
    unattributed: doc?.unattributed === true,
    // 'mismatch' — Olocker returned a different number of rows than sent;
    // 'timeout'  — Olocker never answered, so policies may exist unrecorded.
    unattributedReason: doc?.unattributed === true ? (doc?.unattributed_reason ?? 'mismatch') : null,
  };
}

/**
 * Appends newly issued policies to an invoice's record.
 *
 * @param {{
 *   env: string,
 *   transactionId: number,
 *   documentNo: string,
 *   partyId: number|null,
 *   createdBy: string|null,
 *   items: object[],       // { key, inv_itemsrno, item_code, item_name, insured_amount, policy, url }
 *   rawResponse: unknown,  // exactly what Olocker returned, for support tickets
 *   unattributed?: boolean,// policies that could not be tied to a specific line
 *   unattributedReason?: 'mismatch'|'timeout',
 * }} params
 */
export async function appendInvoicePolicies({
  env, transactionId, documentNo, partyId, createdBy, items, rawResponse,
  unattributed = false,
  unattributedReason = 'mismatch',
}) {
  const db = await getDb();
  const now = new Date();

  await db.collection(COLLECTION).updateOne(
    filterFor(env, transactionId),
    {
      $set: {
        document_no: documentNo ?? null,
        party_id:    partyId ?? null,
        updatedAt:   now,
        // Latches on and never clears itself: once this invoice holds a
        // policy nobody can tie to a line, no amount of later success makes
        // the earlier ambiguity safe to generate on top of.
        ...(unattributed ? { unattributed: true, unattributed_reason: unattributedReason } : {}),
      },
      $setOnInsert: { createdAt: now },
      $push: {
        items:     { $each: items.map((item) => ({ ...item, createdAt: now, createdBy })) },
        responses: { $each: [{ at: now, createdBy, response: rawResponse }], $slice: -20 },
      },
    },
    { upsert: true },
  );
}
