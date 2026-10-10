const NECTOR_REF_NO = { credit: 'NECTOR-CREDITS', coin: 'NECTOR-COINS' };

/**
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
      const hasSplit = promo.credit_value != null || promo.coin_value != null;
      const rows = [];
      if (hasSplit) {
        // promo.credit_value/coin_value come from a preview priced against
        // the FULL order total, so they can exceed mode.amount — the
        // capped, on-screen, cashier-approved figure — whenever Loyalty is
        // combined with another tender/helper balance. Scale the split
        // down to mode.amount so the receipt never redeems more of the
        // customer's real wallet than what was actually shown.
        const rawCredit = Number(promo.credit_value) || 0;
        const rawCoin = Number(promo.coin_value) || 0;
        const rawTotal = rawCredit + rawCoin;
        const capped = Number(mode.amount) || 0;
        const credit = rawTotal > 0 ? Math.round((rawCredit / rawTotal) * capped * 100) / 100 : 0;
        const coin = Math.round((capped - credit) * 100) / 100;
        if (credit > 0) {
          rows.push({ ...base, mode_name: 'Nector credits', ref_no: NECTOR_REF_NO.credit, amount: credit });
        }
        if (coin > 0) {
          rows.push({ ...base, mode_name: 'Nector coins', ref_no: NECTOR_REF_NO.coin, amount: coin });
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
