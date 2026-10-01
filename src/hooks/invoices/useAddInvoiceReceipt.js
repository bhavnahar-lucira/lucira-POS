// Records a payment against an EXISTING invoice (Partial/Due -> less due,
// or Paid in full) via a standalone POS/InvoiceReceipt/Create call.
// Note: unlike receipt_details[] embedded in Invoice/Create (well-verified
// live), this standalone call path is unverified against live UAT data —
// the payload shape mirrors buildReceiptDetails' proven field set as
// closely as possible; treat a failure here as "diagnose live," not
// "shape is wrong."

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { createInvoiceReceipt } from '@/services/orderService';
import TOAST from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

/**
 * @param {{
 *   transactionId: number, partyId: number, companyId: number,
 *   financialYearId: number|null, documentDate?: string,
 *   mode: { modeId, modeCode, modeName, ledgerId, raw? },
 *   amount: number, refNo?: string, bankPos?: number,
 * }} params
 *   bankPos — the bank account's numeric id for a bank-settled mode
 *     (Card/UPI/etc.), same convention confirmed live for checkout's own
 *     receipt_details (documentFields.js) — NOT separately confirmed live
 *     against this standalone InvoiceReceipt/Create endpoint specifically
 *     (see this file's own "unverified live" header note), added 2026-10-01
 *     alongside refNo (reported directly: neither bank account nor
 *     reference number was ever collected here at all).
 */
export function useAddInvoiceReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transactionId, partyId, companyId, financialYearId, documentDate,
      mode, amount, refNo, bankPos,
    }) => {
      const row = mode?.raw ?? {};
      return createInvoiceReceipt({
        transaction_id:     transactionId,
        party_id:           partyId,
        company_id:         companyId,
        financial_year_id:  financialYearId,
        document_date:      documentDate ?? new Date().toISOString(),
        amount,
        ref_no:             refNo ?? '',
        bank_pos:           bankPos ?? undefined,
        mode_id:            mode?.modeId ?? null,
        mode_code:          mode?.modeCode ?? '',
        mode_name:          mode?.modeName ?? '',
        mode_type:          row.mode_type ?? null,
        mode_sub_type:      row.mode_sub_type ?? null,
        ledger_id:          mode?.ledgerId ?? row.ledger_id ?? null,
        exchange_rate:      1,
      });
    },

    // customer_id/store_id come from the invoice being paid (partyId/
    // companyId), not the currently-attached session — an operator can
    // record a receipt against any invoice from the /invoices list, not
    // just the attached customer's own.
    onSuccess: (_data, { transactionId, partyId, companyId, amount, mode }) => {
      toast.success(TOAST.INVOICES.RECEIPT_ADDED);
      tracker.track(EVENTS.INVOICE_RECEIPT_ADDED, {
        transactionId,
        customer_id: partyId ?? 'guest',
        store_id:    companyId,
        amount,
        modeCode:    mode?.modeCode,
      });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },

    onError: (error, { transactionId, partyId, companyId, amount }) => {
      toast.error(TOAST.INVOICES.RECEIPT_FAILED);
      tracker.track(EVENTS.INVOICE_RECEIPT_FAILED, {
        transactionId,
        error: error?.message ?? 'unknown',
        customer_id: partyId ?? 'guest',
        store_id:    companyId,
        amount,
      });
    },
  });
}
