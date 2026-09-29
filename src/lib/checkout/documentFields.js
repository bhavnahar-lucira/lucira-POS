// src/lib/checkout/documentFields.js
// Header fields shared by POS Order (53) and Invoice (54) Create payloads.
// Both captured verbatim from OrnaVerse's own Order counter on 2026-08-05
// (POS/Order/Create → EntityId 259, HO-RPO-08-26-00001).

// Fixed ref_no constants OrnaVerse's own client sends for a Nector Loyalty
// settlement row — see buildReceiptDetails's own header for where these were
// confirmed (buildNectorLoyaltyReceipts, read from their live production bundle).
const NECTOR_REF_NO = { credit: 'NECTOR-CREDITS', coin: 'NECTOR-COINS' };

/**
 * `document_date` in the shape their client sends: LOCAL time, no timezone
 * suffix — e.g. "2026-08-05T20:29:29.533".
 *
 * This is not cosmetic. `new Date().toISOString()`, which this app used,
 * emits UTC: a sale rung up at 00:30 IST becomes 19:00 the PREVIOUS day, so
 * the document lands in the wrong day — and near a month or financial-year
 * boundary, the wrong period. Their own record confirms the convention: the
 * client sent "2026-08-05T20:29:29.533" for an order placed at 20:29 IST.
 *
 * @returns {string}
 */
export function localDocumentDate(now = new Date()) {
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
         `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
         `.${pad(now.getMilliseconds(), 3)}`;
}

/**
 * Builds `receipt_details[]` the way their POS does.
 *
 * This app previously sent four fields — mode_id, mode_code, mode_name,
 * amount. Their captured payload carries fifteen, and the extras are not
 * decoration: `ledger_id` is the account the receipt posts against (150 for
 * Cash on this tenant), and `mode_type`/`mode_sub_type` classify the tender.
 * Every one of them is already present on the PaymentReceiptMode row we
 * fetch, so nothing new has to be looked up — they were simply being dropped
 * on the floor between usePaymentModes and the payload.
 *
 * Fields their client sends, and where each comes from:
 *   mode_id, mode_code, mode_name, mode_type, mode_sub_type, allow_partial,
 *   ledger_id                      → the PaymentReceiptMode row (OR the
 *                                    selected bank account's ledger_id when
 *                                    one is present — see bank_pos below)
 *   party_id, company_id,
 *   financial_year_id, exchange_rate → document context
 *   amount                         → what the operator entered
 *   ref_no                         → empty string for Cash; a real,
 *                                    operator-entered reference for
 *                                    bank-settled modes (their own UI marks
 *                                    it "Reference *" — required, not cosmetic)
 *   cheque_date, cheque_no         → empty strings always (no UI collects these)
 *
 * bank_pos — added 2026-08-13, briefly broke Invoice/Create (sent the bank's
 * string `code`), reverted, then confirmed correct 2026-08-14 via a real
 * network capture of OrnaVerse's own client completing a Credit Card sale
 * on their UAT panel:
 *   - It's the bank account's NUMERIC id (BankPOS/List's `id`), not its
 *     `code` string. That mismatch is exactly what caused the 500.
 *   - When present, `ledger_id` on this same row becomes the bank
 *     account's own ledger_id, not the payment mode's — confirmed from the
 *     same capture (Credit Card's own ledger_id is NOT what was sent;
 *     the selected bank's ledger_id was).
 *   - Omitted entirely for Cash/helper balances — not sent as 0/null,
 *     matching the original all-cash capture where the key was simply
 *     absent from the row.
 *
 * CREDIT ROWS (`mode.creditRef` present) — applying a customer's Return/
 * Exchange/Scheme/Old Gold/Advance balance toward this document — build a
 * DIFFERENT shape, confirmed 2026-08-19 by reading OrnaVerse's own compiled
 * POS client (`buildReceiptFromCredit` in their `chunk-ROKEGHO3.js`) while
 * their UAT was down for a live capture — same technique this project
 * already used for the Repair flow (see BLOCKERS.md's "How the contract was
 * obtained without a capture"), so this is sourced evidence, not a guess:
 *
 *   mode_code/mode_id/mode_type   → copied from the SOURCE credit receipt
 *                                   (a POSReceiptsSelect/List row), not a
 *                                   PaymentReceiptMode row — credits aren't
 *                                   tenders, they don't have one.
 *   mode_sub_type: 2 (hardcoded)  → THE discriminator their own code uses
 *                                   to recognize a credit-application row
 *                                   (`isCreditReceipt()`: mode_sub_type===2
 *                                   || mode_type in a fixed credit-type
 *                                   set) — not mode_code/mode_id, which are
 *                                   just carried through for display/audit.
 *                                   A normal tender row is mode_sub_type 1
 *                                   (their own default when absent).
 *   ledger_id, document_ledger_id → copied from the credit receipt row.
 *   ref_no, ref_document_id,
 *   ref_transaction_id            → the credit receipt's OWN document_no /
 *                                   document_id / transaction_id — this is
 *                                   the actual settlement linkage, meant to
 *                                   knock the balance off that receipt.
 *   party_id, allow_partial       → copied from the credit receipt row.
 *   mode_name                     → deliberately NOT sent — their own
 *                                   function omits it, and POSReceiptsSelect
 *                                   rows never carry one either.
 *
 * CONFIRMED SETTLING 2026-08-19 — completed a real Invoice on Tahir Kutty
 * (party_id 2221, HO-LJ-0826-018, ₹49,825.06 net) applying ₹18,451.00 of his
 * HO-EXC-07-26-00001 Exchange credit + Cash for the remainder. Re-checked
 * POSReceiptsSelect/List immediately after: total available credit dropped
 * from ₹4,71,510.00 to ₹4,53,059.00 (exactly ₹18,451.00 less), and
 * HO-EXC-07-26-00001 itself disappeared from the list entirely (balance hit
 * 0, so it no longer passes the `balance_amount > 0` filter) — every other
 * receipt's balance was untouched. This IS a different mechanism from
 * refundService.js's toRefundReceipt(), which is confirmed NOT to settle on
 * this tenant — the two don't share a code path, so one's brokenness was
 * never evidence against the other, and now this one is positively confirmed
 * working rather than just plausible.
 *
 * NECTOR LOYALTY (`mode.nectorPromotion` present) — a THIRD, DIFFERENT shape
 * again, confirmed 2026-09-28 by reading OrnaVerse's own live production
 * bundle directly (`buildNectorLoyaltyReceipts` in their
 * esm/_chunks/chunk-YMLDVNPO.js, fetched and grepped from the real LIVE
 * host while investigating "Loyalty + Cash doesn't go through"). Their own
 * client does NOT submit one plain tender row for this — it's neither the
 * credit-row shape above (no ref_document_id/ref_transaction_id/
 * document_ledger_id at all — there is no OrnaVerse-side source receipt to
 * reference, Nector's balance lives entirely outside OrnaVerse) nor a plain
 * tender row with the fetched PaymentReceiptMode's own name/blank ref_no
 * (which is what this app was sending before this fix — the likely actual
 * cause of the real-order rejection, not just the isFirst pre-fill bug
 * fixed earlier the same day):
 *
 *   - UP TO TWO rows, one per Nector value type present on the redemption
 *     (`credit_value` and/or `coin_value` — Nector's own "list" promotion
 *     object), never one combined figure.
 *   - `mode_name` is HARD-OVERRIDDEN to "Nector credits" / "Nector coins" —
 *     never the PaymentReceiptMode row's own name ("Nector Loyalty").
 *   - `ref_no` is a FIXED constant per type — "NECTOR-CREDITS" /
 *     "NECTOR-COINS" — literal strings straight out of their bundle, never
 *     blank.
 *   - mode_id/mode_code/ledger_id still come from the real PaymentReceiptMode
 *     row (mode_id 36/"NectorLoyalty"/ledger_id 135 on this tenant) — only
 *     the name is swapped.
 *
 * @param {{
 *   paymentModes: {modeId, modeCode, modeName, amount, refNo?: string, bankPosId?: number|null, raw?: object, creditRef?: object, nectorPromotion?: object}[],
 *   customerId:    number,
 *   activeStoreId: number,
 *   exchangeRate:  number,
 *   headerConfig:  { financialYearId: number|null },
 * }} params
 * @returns {object[]}
 */
export function buildReceiptDetails({
  paymentModes, customerId, activeStoreId, exchangeRate, headerConfig,
}) {
  return paymentModes.flatMap((mode) => {
    if (mode.nectorPromotion) {
      const promo = mode.nectorPromotion;
      const row = mode.raw ?? {};
      const base = {
        mode_id:            mode.modeId   ?? row.mode_id   ?? null,
        mode_code:          mode.modeCode ?? row.mode_code ?? '',
        mode_type:          row.mode_type ?? null,
        mode_sub_type:      2,
        ledger_id:          mode.ledgerId ?? row.ledger_id ?? null,
        allow_partial:      false,
        cheque_date:        '',
        cheque_no:          '',
        party_id:           customerId,
        company_id:         activeStoreId,
        financial_year_id:  headerConfig.financialYearId,
        exchange_rate:      exchangeRate,
      };
      // credit_value/coin_value are Nector's own field names on the
      // redemption promotion object — a genuinely absent one (undefined,
      // not 0) means that type isn't part of this redemption at all, so no
      // row for it. A promotion carrying neither (only a lump fiat_value,
      // if that's ever the actual live shape) falls back to a single
      // "credits" row with the full claimed amount — never silently drops
      // the whole redemption.
      const hasSplit = promo.credit_value != null || promo.coin_value != null;
      const rows = [];
      if (hasSplit) {
        if (Number(promo.credit_value) > 0) {
          rows.push({ ...base, mode_name: 'Nector credits', ref_no: NECTOR_REF_NO.credit, amount: Number(promo.credit_value) });
        }
        if (Number(promo.coin_value) > 0) {
          rows.push({ ...base, mode_name: 'Nector coins', ref_no: NECTOR_REF_NO.coin, amount: Number(promo.coin_value) });
        }
      } else {
        rows.push({ ...base, mode_name: 'Nector credits', ref_no: NECTOR_REF_NO.credit, amount: mode.amount });
      }
      return rows;
    }

    if (mode.creditRef) {
      const credit = mode.creditRef;
      return {
        amount:             mode.amount,
        mode_id:            credit.mode_id,
        mode_code:          credit.mode_code,
        mode_type:          credit.mode_type,
        mode_sub_type:      2,
        ledger_id:          credit.ledger_id,
        document_ledger_id: credit.document_ledger_id,
        ref_no:             credit.document_no,
        ref_document_id:    credit.document_id ?? credit.ref_document_id,
        ref_transaction_id: credit.transaction_id ?? credit.ref_transaction_id,
        allow_partial:      credit.allow_partial ?? false,
        cheque_date:        '',
        cheque_no:          '',
        party_id:           credit.party_id ?? customerId,
        company_id:         activeStoreId,
        financial_year_id:  headerConfig.financialYearId,
        exchange_rate:      exchangeRate,
      };
    }

    // `raw` is the untouched PaymentReceiptModeRow (see usePaymentModes).
    const row = mode.raw ?? {};
    return {
      amount:            mode.amount,
      ref_no:            mode.refNo ?? '',
      mode_id:           mode.modeId ?? row.mode_id ?? null,
      mode_code:         mode.modeCode ?? row.mode_code ?? '',
      mode_name:         mode.modeName ?? row.mode_name ?? '',
      mode_type:         row.mode_type ?? null,
      mode_sub_type:     row.mode_sub_type ?? 1, // 1 = normal tender — their own default
      allow_partial:     row.allow_partial ?? false,
      cheque_date:       '',
      cheque_no:         '',
      ...(mode.bankPosId != null ? { bank_pos: mode.bankPosId } : {}),
      party_id:          customerId,
      ledger_id:         mode.ledgerId ?? row.ledger_id ?? null,
      company_id:        activeStoreId,
      financial_year_id: headerConfig.financialYearId,
      exchange_rate:     exchangeRate,
    };
  });
}
