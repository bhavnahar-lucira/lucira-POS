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
