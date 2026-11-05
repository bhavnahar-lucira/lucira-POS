'use client';

import { useState } from 'react';
import {
  X, Calendar, User, Hash, IndianRupee, AlertCircle, Ban,
} from 'lucide-react';

import {
  useCancelReturn, useDeleteRefund, useCancelCreditNote, useCancelAdvanceReceipt,
  useCancelExchange, useCancelBuyback, useCancelURDPurchase,
} from '@/hooks/transactions/useTransactionMutations';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import PaymentStatusBadge from '@/components/shared/PaymentStatusBadge';
import InvoiceReportButton from '@/components/features/checkout/InvoiceReportButton';
import { Button } from '@/components/ui/button';
import APP_CONFIG from '@/constants/appConfig';
import { formatDatePadded } from '@/lib/dateUtils';
import { formatAmountOrDash } from '@/lib/priceUtils';

const formatINR = formatAmountOrDash;
const formatDate = formatDatePadded;

const CANCEL_LABEL_BY_TYPE = {
  returns:          'Cancel Return',
  refunds:          'Delete Refund',
  'credit-notes':   'Cancel Credit Note',
  'advance-receipt':'Cancel Advance Receipt',
  exchange:         'Cancel Exchange',
  buyback:          'Cancel Buyback',
  urd:              'Cancel URD Purchase',
};

// Print — reuses the exact same report-picker/printer checkout already uses
// for Invoice (InvoiceReportButton is generic over documentId); just the
// right document_id + label per transaction type. Self-hides if OrnaVerse
// has no report configured for that document type (see component's own
// `reports.length === 0` check), so adding it here is zero-risk even for a
// type that turns out to have none.
const PRINT_CONFIG_BY_TYPE = {
  returns:          { documentId: APP_CONFIG.DOCUMENT_TYPES.RETURN,       label: 'Return' },
  refunds:          { documentId: APP_CONFIG.DOCUMENT_TYPES.REFUND,       label: 'Refund' },
  'credit-notes':   { documentId: APP_CONFIG.DOCUMENT_TYPES.CREDIT_NOTE,  label: 'Credit Note' },
  'advance-receipt':{ documentId: APP_CONFIG.DOCUMENT_TYPES.POS_RECEIPT,  label: 'Advance Receipt' },
  exchange:         { documentId: APP_CONFIG.DOCUMENT_TYPES.EXCHANGE,     label: 'Exchange' },
  buyback:          { documentId: APP_CONFIG.DOCUMENT_TYPES.BUYBACK,      label: 'Buy Back' },
  urd:              { documentId: APP_CONFIG.DOCUMENT_TYPES.URD_PURCHASE, label: 'URD Purchase' },
};

export default function TransactionDetailSheet({ transaction, type, onClose, allowCancel = true }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelReturn     = useCancelReturn({ onSuccess: onClose });
  const deleteRefund     = useDeleteRefund({ onSuccess: onClose });
  const cancelCreditNote = useCancelCreditNote({ onSuccess: onClose });
  const cancelAdvanceReceipt = useCancelAdvanceReceipt({ onSuccess: onClose });
  const cancelExchange   = useCancelExchange({ onSuccess: onClose });
  const cancelBuyback    = useCancelBuyback({ onSuccess: onClose });
  const cancelURDPurchase = useCancelURDPurchase({ onSuccess: onClose });

  const mutationByType = {
    returns: cancelReturn, refunds: deleteRefund, 'credit-notes': cancelCreditNote,
    'advance-receipt': cancelAdvanceReceipt,
    exchange: cancelExchange, buyback: cancelBuyback, urd: cancelURDPurchase,
  };

  if (!transaction) return null;
  const raw = transaction.raw ?? {};

  const cancelLabel = allowCancel && transaction.status !== 'cancelled' ? CANCEL_LABEL_BY_TYPE[type] : null;
  const cancelMutation = mutationByType[type];

  const headerRows = [
    { icon: Hash,        label: 'Document No', value: transaction.documentNo ?? `#${transaction.transactionId}` },
    { icon: Calendar,    label: 'Date',        value: formatDate(transaction.documentDate) },
    { icon: User,        label: 'Customer',    value: transaction.customerName ?? '—' },
    { icon: IndianRupee, label: 'Amount',      value: formatINR(transaction.amount) },
    ...(raw.posted_by_name
      ? [{ icon: AlertCircle, label: 'Posted By', value: raw.posted_by_name }]
      : []),
  ];

  const skipKeys = new Set(['transaction_id', 'document_no', 'document_date', 'party_id', 'party_name', 'net_amount', 'company_id', 'current_company_id', 'document_status', 'posted_by_name']);

  const extraRows = Object.entries(raw)
    .filter(([k, v]) => !skipKeys.has(k) && v !== null && v !== undefined && v !== 'NA' && v !== '' && typeof v !== 'object')
    .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: String(v) }));

  const printConfig = PRINT_CONFIG_BY_TYPE[type];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-50 flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground">Transaction</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{transaction.documentNo ?? `#${transaction.transactionId}`}</p>
              {transaction.status && <PaymentStatusBadge status={transaction.status} size="sm" />}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <div className="bg-muted/30 rounded-xl p-4 flex flex-col gap-3">
            {headerRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium text-foreground break-words">{value}</p>
                </div>
              </div>
            ))}
          </div>
          {extraRows.length > 0 && (
            <div className="flex flex-col gap-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Additional Details</p>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {extraRows.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <p className="text-xs text-muted-foreground capitalize">{label}</p>
                    <p className="text-xs font-medium text-foreground text-right max-w-[55%] break-words">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {(printConfig || cancelLabel) && (
          <div className="border-t border-border p-4 flex flex-col gap-2">
            {printConfig && (
              <InvoiceReportButton
                transactionId={transaction.transactionId}
                documentId={printConfig.documentId}
                documentLabel={printConfig.label}
              />
            )}
            {cancelLabel && (
              <Button
                type="button"
                variant="destructive"
                className="w-full h-11 gap-1.5"
                disabled={cancelMutation.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                <Ban className="w-4 h-4" />
                {cancelMutation.isPending ? 'Working…' : cancelLabel}
              </Button>
            )}
          </div>
        )}
      </div>

      {cancelLabel && (
        <ConfirmDialog
          isOpen={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={cancelLabel}
          description={`This will permanently void ${transaction.documentNo ?? `#${transaction.transactionId}`} in OrnaVerse. This cannot be undone.`}
          confirmLabel={cancelLabel}
          onConfirm={() => cancelMutation.mutate(transaction.transactionId)}
        />
      )}
    </>
  );
}

