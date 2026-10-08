import { roundToNearestRupee } from '@/lib/priceUtils';

// Shared Order/Invoice Create header-field block, generalized for the other
// POS transaction types (Return/Refund/CreditNote/Exchange/Buyback/URD
// Purchase/Repair/SchemeReceipt), which share the same OrnaVerse.POS.*Row
// schema shape as OrderRow/InvoiceRow.
//
// Confirmed live for Order/Invoice AND now Return (2026-09-22 — a real
// Return created against Tahir Test's HO-LJ-0926-016 on UAT: EntityId 157,
// document_no HO-PSR-09-26-00005, correctly auto-posted, correctly linked
// back via ref_transaction_id/ref_document_id, balance_amount correctly
// held open at the full net amount). Exchange/Buyback/Credit-Note/URD still
// extrapolated, not yet individually confirmed — each flow's own quirks
// (line-item shape, extra required fields) aren't guaranteed to be fully
// covered — treat a 500 on any of these as needing its own live-capture
// diagnostic rather than a sign this function is wrong.

/**
 * @param {{
 *   subTotal: number, taxableAmount: number, taxAmount: number, netAmount: number,
 *   pieces?: number, weight?: number, netWeight?: number,
 *   discount?: number,
 *   customerId: number, customerName?: string, customerMobile?: string,
 *   activeStoreId: number,
 *   headerConfig: { financialYearId, ledgerId, isTaxApplicable, autoPosting, isDocumentNumberEditable },
 *   documentTypeId: number,
 *   receiptAmount?: number,
 *   exchangeRate?: number,
 *   documentDate?: string, // ISO string — defaults to now; pass the form's
 *     own user-selected date so it isn't silently overwritten with "now".
 *   forReturn?: boolean,   // emit the RETURN header variant — see below
 * }} params
 * @returns {object} fields to spread onto a transaction Entity, alongside
 *   whatever flow-specific fields (line_items, receipt_details, ref_transaction_id...)
 */
export function buildTransactionHeaderFields({
  subTotal, taxableAmount, taxAmount, netAmount,
  pieces = 0, weight = 0, netWeight = 0,
  discount = 0,
  customerId, customerName, customerMobile,
  activeStoreId,
  headerConfig,
  documentTypeId,
  receiptAmount = 0,
  exchangeRate = 1,
  documentDate,
  forReturn = false,
  allowBackdatedEntry = false,
}) {
  const discountedNet = +Math.max(0, netAmount - discount).toFixed(2);
  const roundedNet = roundToNearestRupee(discountedNet);
  const round_off  = +(roundedNet - discountedNet).toFixed(2);

  // RETURN variant — a Return header is NOT just an Order header with a
  // different document_id; it differs in four ways:
  //   · no `taxable_amount`, no `mobile`, no `promotion_details`
  //   · no header-level ref_transaction_id/ref_document_id (the per-line
  //     ref_* fields already tie it to the original sale)
  //   · `is_tax_applicable: false` — a return reverses the original sale's
  //     tax rather than recomputing it
  //   · `balance_amount` equals net (not net - receipt): the credit stands
  //     until a separate Refund/CreditNote settles it
  if (forReturn) {
    return {
      party_id:      customerId,
      party_name:    customerName ?? undefined,
      user_id:       null,
      company_id:    activeStoreId,
      document_date: documentDate ?? new Date().toISOString(),
      currency_id:   103,
      exchange_rate: exchangeRate,
      pieces, weight, net_weight: netWeight,
      sub_total:       subTotal,
      discount,
      tax_amount:      taxAmount,
      net_amount:      roundedNet,
      base_sub_total:  subTotal,
      base_net_amount: roundedNet,
      base_tax_amount: taxAmount,
      round_off,
      receipt_amount:  roundedNet,
      balance_amount:  roundedNet,
      document_id:                 documentTypeId,
      financial_year_id:           headerConfig.financialYearId,
      ledger_id:                   headerConfig.ledgerId,
      payable_ledger_id:           headerConfig.payableLedgerId ?? undefined,
      receivable_ledger_id:        headerConfig.receivableLedgerId ?? undefined,
      is_tax_applicable:           false,
      auto_posting:                headerConfig.autoPosting,
      is_document_number_editable: headerConfig.isDocumentNumberEditable,
      // Return sends false, Buy Back sends true — matches their captured
      // payloads; a buyback can legitimately be dated to intake.
      allow_backdated_entry:       allowBackdatedEntry,
      number_of_backdated_days:    headerConfig.numberOfBackdatedDays ?? 60,
      is_einvoice:                 false,
    };
  }

  return {
    party_id:      customerId,
    party_name:    customerName ?? undefined,
    mobile:        customerMobile ?? undefined,
    user_id:       null,
    company_id:    activeStoreId,
    document_date: documentDate ?? new Date().toISOString(),
    currency_id:   103, // INR — see APP_CONFIG.CURRENCY.INR_ID
    exchange_rate: exchangeRate,
    pieces, weight, net_weight: netWeight,
    sub_total:      subTotal,
    discount,
    taxable_amount: taxableAmount,
    tax_amount:     taxAmount,
    net_amount:     roundedNet,
    base_sub_total: subTotal,
    base_net_amount: roundedNet,
    base_tax_amount: taxAmount,
    round_off,
    receipt_amount: receiptAmount,
    balance_amount: +(roundedNet - receiptAmount).toFixed(2),
    document_id:                 documentTypeId,
    // document_no deliberately NOT sent — server assigns it (see the note at
    // the bottom of documentConfigService.js).
    financial_year_id:           headerConfig.financialYearId,
    ledger_id:                   headerConfig.ledgerId,
    is_tax_applicable:           headerConfig.isTaxApplicable,
    auto_posting:                headerConfig.autoPosting,
    is_document_number_editable: headerConfig.isDocumentNumberEditable,
    allow_backdated_entry:       false,
    number_of_backdated_days:    0,
    is_einvoice:                 false,
    promotion_details: [],
  };
}
