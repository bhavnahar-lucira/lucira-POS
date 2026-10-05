import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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

    onSuccess: (_data, { transactionId, partyId, companyId, amount, mode, refNo }) => {
      toast.success(TOAST.INVOICES.RECEIPT_ADDED);
      tracker.track(EVENTS.INVOICE_RECEIPT_ADDED, {
        transactionId,
        customer_id: partyId ?? 'guest',
        store_id:    companyId,
        amount,
        modeCode:    mode?.modeCode,
        payment_reference: refNo || null,
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
