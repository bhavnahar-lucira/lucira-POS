'use client';

import { Badge } from '@/components/ui/badge';

const CONFIG = {
  settled:   { label: 'Paid',      classes: 'bg-status-in-stock/10 text-status-in-stock ring-1 ring-status-in-stock/20' },
  completed: { label: 'Completed', classes: 'bg-status-in-stock/10 text-status-in-stock ring-1 ring-status-in-stock/20' },
  partial:   { label: 'Partial',   classes: 'bg-status-made-order/10 text-status-made-order ring-1 ring-status-made-order/20' },
  overdue:   { label: 'Due',       classes: 'bg-status-error/10 text-status-error ring-1 ring-status-error/20' },
  pending:   { label: 'Pending',   classes: 'bg-muted text-muted-foreground ring-1 ring-border' },
  cancelled: { label: 'Cancelled', classes: 'bg-muted text-muted-foreground ring-1 ring-border' },
  draft:     { label: 'Draft',     classes: 'bg-muted text-muted-foreground ring-1 ring-border' },
};

// Callers speak slightly different raw vocabularies for the same states.
export function mapOrderStatus(raw) {
  return { paid: 'settled', partial: 'partial', due: 'overdue', cancelled: 'cancelled', draft: 'draft' }[raw] ?? 'pending';
}
export function mapScheduleStatus(raw) {
  return { paid: 'settled', overdue: 'overdue', upcoming: 'pending' }[raw] ?? 'pending';
}
export function mapReturnStatus(raw) {
  return { refunded: 'settled', partial: 'partial', pending: 'pending' }[raw] ?? 'pending';
}
// document_status: 0 Draft / 1 Posted / 2 Cancelled — same Serenity-wide
// convention as deriveDocumentStatus (useCustomerOrders.js), but these
// transaction types (Return/Refund/Exchange/Buyback/Credit Note/URD) have
// no partial/due balance state, so Posted just reads as "Completed".
export function mapTransactionStatus(documentStatus) {
  if (documentStatus == null) return null;
  if (documentStatus === 2) return 'cancelled';
  if (documentStatus === 0) return 'draft';
  return 'completed';
}

export default function PaymentStatusBadge({ status, labelOverride, size = 'md' }) {
  if (!status) return null;
  const { label, classes } = CONFIG[status] ?? CONFIG.pending;
  const sizeClasses = size === 'sm'
    ? 'h-auto px-2 py-0.5 text-[11px]'
    : 'h-auto px-3 py-1 text-xs';

  return (
    <Badge className={`rounded-full font-medium ${sizeClasses} ${classes}`}>
      {labelOverride ?? label}
    </Badge>
  );
}
