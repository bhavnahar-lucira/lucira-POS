// A POS Advance Receipt — a pure prepayment with no items and no linked
// invoice yet. Confirmed live 2026-10-16 by capturing OrnaVerse's own POS
// "Advance F8" tab. A genuinely different document from Credit Note (which
// is an item-level Return): this is document_id 57 ("PRC", same as
// APP_CONFIG.DOCUMENT_TYPES.POS_RECEIPT), flagged is_advance:true, with no
// line_items at all — just a party + a payment-mode breakdown. One Create
// call fully commits it; there's no separate Post step (the real captured
// receipt's document_status was already 1/Completed with no Post call made).
//
// Helper text from OrnaVerse's own UI: "Book customer advance payments here.
// The amount is posted as an advance receipt and can be applied on invoice
// or order." — confirmed live: creating one made a new "N credit source(s)
// available" badge appear on that customer's Invoice tab.

import axiosInstance from '@/lib/axios/axiosInstance';
import API from '@/constants/apiEndpoints';
import APP_CONFIG from '@/constants/appConfig';

/**
 * Paginated list of advance receipt transactions.
 * @param {{ company_id: number, take?: number, skip?: number }} params
 */
export async function getAdvanceReceipts({ company_id, take = 50, skip = 0 } = {}) {
  const response = await axiosInstance.post(API.ADVANCE_RECEIPT.LIST, {
    company_id: company_id ?? undefined,
    Take: take,
    Skip: skip,
  });
  return response.data;
}

/**
 * Single advance receipt by transaction_id.
 * @param {number} transactionId
 */
export async function getAdvanceReceiptDetail(transactionId) {
  const response = await axiosInstance.post(API.ADVANCE_RECEIPT.RETRIEVE, {
    EntityId: transactionId,
  });
  return response.data;
}

/**
 * Creates (and fully commits — no Post step) an advance receipt.
 *
 * @param {{
 *   partyId: number, activeStoreId: number, financialYearId: number,
 *   ledgerId: number, numberOfBackdatedDays?: number, documentDate?: string,
 *   narration?: string,
 *   payout?: { modeId: number, ledgerId: number, amount: number, bankPos?: number,
 *              refNo?: string, chequeNo?: string, chequeDate?: string },
 *   payments?: Array<{ modeId: number, ledgerId?: number, amount: number, bankPos?: number, bankPosId?: number,
 *                      refNo?: string, chequeNo?: string, chequeDate?: string }>,
 * }} params
 * @returns {Promise<object>} SaveResponse { EntityId }
 */
export async function createAdvanceReceipt({
  partyId, activeStoreId, financialYearId, ledgerId, numberOfBackdatedDays,
  documentDate, narration, payout, payments,
}) {
  const paymentList = payments?.length
    ? payments
    : (payout ? [payout] : []);

  const totalAmount = paymentList.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const details = paymentList.map((p) => ({
    mode_id:       p.modeId,
    ledger_id:     p.ledgerId ?? ledgerId,
    amount:        Number(p.amount) || 0,
    exchange_rate: 1,
    bank_pos:      p.bankPos ?? p.bankPosId ?? '',
    ref_no:        p.refNo ?? '',
    cheque_no:     p.chequeNo ?? '',
    cheque_date:   p.chequeDate ?? '',
  }));

  const entity = {
    document_id:   APP_CONFIG.DOCUMENT_TYPES.POS_RECEIPT,
    party_id:       partyId,
    company_id:     activeStoreId,
    financial_year_id: financialYearId,
    currency_id:    103,
    exchange_rate:  1,
    document_date:  documentDate ?? new Date().toISOString(),
    user_id:        null,
    is_einvoice:    false,
    auto_posting:   true,
    is_tax_applicable: false,
    is_document_number_editable: false,
    allow_backdated_entry: false,
    number_of_backdated_days: numberOfBackdatedDays ?? 0,
    ledger_id:          ledgerId,
    document_ledger_id: ledgerId,
    is_advance:   true,
    total_amount: totalAmount,
    knock_off_total: 0,
    narration: narration || '',
    details,
    party_balance: [],
    // document_no deliberately omitted — the server assigns it.
  };

  const response = await axiosInstance.post(API.ADVANCE_RECEIPT.CREATE, { Entity: entity });
  return response.data;
}

const isOpenAdvance = (row) => row.document_id === APP_CONFIG.DOCUMENT_TYPES.POS_RECEIPT
  && Number(row.balance_amount) > 0;

async function openAdvanceRows(partyId) {
  if (!partyId) return [];
  const response = await axiosInstance.post(API.REFUNDS.CUSTOMER_CREDITS, { party_id: partyId });
  return (response.data?.Entities ?? []).filter(isOpenAdvance);
}

/**
 * The customer's advance receipts that are still completely unused (balance = amount), with their
 * payment lines — so an advance already booked in OrnaVerse can be linked instead of booked twice.
 * @param {number} partyId
 */
export async function listUnusedAdvanceReceipts(partyId) {
  const rows = (await openAdvanceRows(partyId))
    .filter((r) => Math.abs(Number(r.balance_amount) - Number(r.amount)) < 0.01);
  return Promise.all(rows.map(async (r) => {
    const entity = (await getAdvanceReceiptDetail(r.transaction_id))?.Entity ?? {};
    return {
      id: r.transaction_id,
      documentNo: r.document_no,
      documentDate: r.document_date,
      amount: Number(r.amount) || 0,
      details: (entity.details ?? []).map((d) => ({
        modeId: d.mode_id, modeName: d.mode_name || `Mode ${d.mode_id}`, modeCode: d.mode_code ?? '',
        amount: Number(d.amount) || 0, bankPosId: d.bank_pos ? Number(d.bank_pos) : null, refNo: d.ref_no ?? '',
      })),
    };
  }));
}

/**
 * Reference numbers in `payments` that already appear on one of the customer's open advance receipts —
 * the same UPI/card payment being booked a second time.
 * @returns {Promise<{ refNo: string, documentNo: string }[]>}
 */
export async function findReusedPaymentRefs(partyId, payments) {
  const refs = new Set((payments ?? []).map((p) => p.refNo?.trim()).filter(Boolean));
  if (!refs.size) return [];
  const rows = (await openAdvanceRows(partyId)).slice(0, 25);
  const hits = await Promise.all(rows.map(async (r) => {
    const entity = (await getAdvanceReceiptDetail(r.transaction_id))?.Entity ?? {};
    return (entity.details ?? [])
      .filter((d) => d.ref_no && refs.has(String(d.ref_no).trim()))
      .map((d) => ({ refNo: String(d.ref_no).trim(), documentNo: r.document_no }));
  }));
  return hits.flat();
}

/**
 * Cancel an advance receipt.
 * @param {number} transactionId
 */
export async function cancelAdvanceReceipt(transactionId) {
  const response = await axiosInstance.post(API.ADVANCE_RECEIPT.CANCEL, {
    EntityId: transactionId,
  });
  return response.data;
}
