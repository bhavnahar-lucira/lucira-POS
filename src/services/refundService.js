// A POS Refund pays out credit that a Return / Exchange / Buy Back already
// raised. It is NOT a transaction with line items.
//
// The credit loop:
//   Return / Exchange / Buy Back  → raises customer credit
//   getCustomerCredits()          → that customer's OUTSTANDING credits
//   createRefund()                → knocks one off and pays it out
//
// There is no Refund screen in OrnaVerse's own POS UI — only the ERP
// (/POS/Refund) has one.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';

/**
 * Credits this customer still has outstanding — i.e. what a refund can pay
 * out. Already-settled credits are filtered out server-side.
 *
 * Each row is a Return/Exchange/Buy Back document:
 *   { transaction_id, document_id, document_no, document_date, document_name,
 *     amount, ledger_id, document_ledger_id, mode_id, mode_code, mode_type }
 *
 * companyId must be passed and forwarded — without it the picker shows a
 * customer's credit from every store regardless of which one is active,
 * since this endpoint genuinely scopes by it.
 * @param {{ partyId: number, companyId?: number }} params
 * @returns {Promise<object[]>}
 */
export async function getCustomerCredits({ partyId, companyId }) {
  if (!partyId) return [];
  const response = await axiosInstance.post(API.REFUNDS.CUSTOMER_CREDITS, {
    party_id:   partyId,
    company_id: companyId,
  });
  return response.data?.Entities ?? [];
}

/**
 * Maps an outstanding-credit row into the receipt entry a refund needs.
 *
 * `transaction_id` is what actually links the refund to the credit —
 * omitting it (while still sending document_no/document_id) saves cleanly
 * but settles nothing; the credit stays outstanding.
 *
 * `ref_document_no` (the refund's own document number) is deliberately not
 * set here — the server assigns it; see stampRefDocumentNo below for why we
 * don't predict it.
 *
 * @param {object} credit — a row from getCustomerCredits()
 * @param {number} amount — how much of it to settle (allow_partial is true)
 */
function toRefundReceipt(credit, amount) {
  return {
    transaction_id:     credit.transaction_id,   // ← the actual linkage
    document_id:        credit.document_id,
    document_no:        credit.document_no,
    document_date:      credit.document_date,
    document_name:      credit.document_name,
    document_ledger_id: credit.document_ledger_id ?? credit.ledger_id,
    ledger_id:          credit.ledger_id,
    mode_id:            credit.mode_id,
    mode_code:          credit.mode_code,
    amount,
    party_id:           credit.party_id,
    ref_document_id:    126,   // POS Refund — see APP_CONFIG.DOCUMENT_TYPES.REFUND
    allow_partial:      true,
  };
}

/**
 * Reads back the document number the server actually assigned.
 * @param {number} transactionId
 */
async function retrieveRefund(transactionId) {
  const response = await axiosInstance.post(API.REFUNDS.RETRIEVE, {
    EntityId: transactionId,
  });
  return response.data?.Entity ?? null;
}

/**
 * Second pass intended to make the credit actually settle.
 *
 * Settlement is keyed on `receipts[].ref_document_no` matching the refund's
 * OWN document_no. Predicting that number client-side (as OrnaVerse's ERP
 * dialog does, from DocumentNumbering) can disagree with what the server
 * actually assigns on a tenant whose counter has drifted, so nothing
 * settles. This creates first, reads back the real assigned number, and
 * stamps it into the receipts instead — drift-proof by construction.
 *
 * KNOWN LIMITATION, RE-CONFIRMED 2026-09-17 on UAT with a fresh real credit
 * (Return transaction_id 153, Refund transaction_id 51) — this stamping
 * step does NOT settle the credit. BOTH leads this comment previously
 * raised have now been tried live and BOTH failed:
 *   1. Stamping ref_document_no into the REFUND's own receipts[] (what this
 *      function does) — Refund/Update returned 200, but
 *      POSReceiptsSelect/List still showed the credit fully outstanding
 *      (ref_document_no still "", balance_amount unchanged) afterward.
 *   2. Directly Update-ing the ORIGINAL credit document's own
 *      balance_amount/receipt_amount to 0/settled (the "one-off test"
 *      mentioned in an earlier version of this comment) — ALSO tried live
 *      this time: the Return's own Retrieve correctly showed
 *      balance_amount:0 afterward, but POSReceiptsSelect/List (the actual
 *      row getCustomerCredits() reads — see that function's own header)
 *      was STILL unchanged, ref_document_no still "". So
 *      POSReceiptsSelect/List is reading a genuinely separate
 *      receipts/ledger record, not derived from the source document's own
 *      balance_amount field the way Retrieve's echo of it might suggest.
 *      (Reverted that test edit back to the credit's real balance
 *      afterward, then cancelled both test documents — no lasting change
 *      left on the tenant.)
 *   3. Retrieve's own echo of what was sent corrupts the linkage —
 *      `receipts[].transaction_id` comes back as the REFUND's own
 *      transaction_id, not the original credit's — so `entity.receipts`
 *      is not safe to round-trip verbatim.
 * Net effect: money genuinely leaves (the `details[]` payout side works),
 * but the credit it's meant to close never clears from
 * POSReceiptsSelect/List by any mechanism tried so far. Whatever actually
 * flips that row needs a live network capture of OrnaVerse's own ERP
 * client (the only UI that has a real Refund screen — see this file's own
 * top comment) completing a real Refund end-to-end; guessing further here
 * risks touching real ledger/receipt state without understanding what
 * update actually closes it.
 */
async function stampRefDocumentNo(transactionId) {
  const entity = await retrieveRefund(transactionId);
  if (!entity?.document_no || !entity.receipts?.length) return null;

  const alreadyStamped = entity.receipts.every(
    (r) => r.ref_document_no === entity.document_no,
  );
  if (alreadyStamped) return entity;

  const patched = {
    ...entity,
    receipts: entity.receipts.map((r) => ({
      ...r,
      ref_document_no: entity.document_no,
      ref_document_id: 126,
    })),
  };

  await axiosInstance.post(API.REFUNDS.UPDATE, { Entity: patched });
  return patched;
}

/**
 * Creates a refund, then settles it.
 *
 * Create carries details[] and receipts[] nested (one call — there is no
 * Post step for document 126). A follow-up Update then stamps the assigned
 * document number into the receipts, which is what knocks the credit off
 * (see stampRefDocumentNo's own header for its known limitation).
 *
 * @param {{
 *   partyId: number, partyName: string, activeStoreId: number,
 *   financialYearId: number, documentDate?: string,
 *   credits: { credit: object, amount: number }[],  // what's being settled
 *   payout: { modeId: number, ledgerId: number, amount: number, bankPos?: number,
 *             refNo?: string, chequeNo?: string, chequeDate?: string },
 * }} params
 * @returns {Promise<object>} SaveResponse { EntityId }
 */
export async function createRefund({
  partyId, partyName, activeStoreId, financialYearId,
  documentDate, credits, payout,
}) {
  const knockOffTotal = +credits
    .reduce((sum, c) => sum + (c.amount ?? 0), 0)
    .toFixed(2);

  const entity = {
    party_id:      partyId,
    party_name:    partyName,
    company_id:    activeStoreId,
    document_date: documentDate ?? new Date().toISOString(),
    document_id:   126,
    financial_year_id: financialYearId,
    currency_id:   103,
    exchange_rate: 1,
    user_id:       null,
    // both sides must balance — the ERP blocks Save otherwise
    total_amount:    payout.amount,
    knock_off_total: knockOffTotal,
    payable_ledger_id:    167,
    receivable_ledger_id: 167,
    narration: '',
    // present-but-empty in the ERP's own payload; sent for parity
    bill_no:   '',
    bill_date: null,
    ref_no:    '',
    ref_date:  null,
    tax_ledger_id:    null,
    output_ledger_id: null,
    // HOW the money leaves
    details: [{
      mode_id:       payout.modeId,
      ledger_id:     payout.ledgerId,
      amount:        payout.amount,
      exchange_rate: 1,
      bank_pos:      payout.bankPos ?? '',
      cheque_no:     payout.chequeNo ?? '',
      cheque_date:   payout.chequeDate ?? null,
      ref_no:        payout.refNo ?? '',
      mode_name:     payout.modeName ?? undefined,
      mode_code:     payout.modeCode ?? undefined,
      mode_type:     payout.modeType ?? undefined,
    }],
    // WHICH credits are knocked off
    receipts: credits.map(({ credit, amount }) => toRefundReceipt(credit, amount)),
    // document_no deliberately omitted — the server assigns it.
  };

  const response = await axiosInstance.post(API.REFUNDS.CREATE, { Entity: entity });
  const transactionId = response.data?.EntityId;

  // The knock-off only registers once the assigned document number is
  // stamped back into the receipts. A failure here leaves a created-but-
  // unsettled refund rather than losing the record, so surface it instead
  // of swallowing it.
  if (transactionId) await stampRefDocumentNo(transactionId);

  return response.data;
}
