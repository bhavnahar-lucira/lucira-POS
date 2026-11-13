import { formatAmountOrDash } from '@/lib/priceUtils';
import { formatDatePadded } from '@/lib/dateUtils';
import { DOCUMENT_STATUS, REPAIR_LOCATION_TYPE, REPAIR_TYPE } from '@/services/repairService';

export const formatINR = formatAmountOrDash;
export const formatDate = formatDatePadded;

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const weight = (v) => (v == null ? '—' : `${Number(v).toFixed(3)} g`);

const TONE = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-primary/10 text-primary',
  success: 'bg-status-in-stock/10 text-status-in-stock',
  warning: 'bg-status-made-order/10 text-status-made-order',
  danger: 'bg-destructive/10 text-destructive',
};

export const toneClass = (tone) => TONE[tone] ?? TONE.neutral;

export function repairTypeLabel(type) {
  if (type === REPAIR_TYPE.STOCK_ITEM) return 'Own stock';
  if (type === REPAIR_TYPE.SOLD_ITEM) return 'Sold item';
  if (type === REPAIR_TYPE.CUSTOMER_ITEM) return 'Customer item';
  return null;
}

export function locationLabel(type) {
  return type === REPAIR_LOCATION_TYPE.HEAD_OFFICE ? 'Head Office' : 'Workshop';
}

/** One status chip per document, using only what OrnaVerse returns on the document itself. */
export function documentStatus(kind, doc, billedInvoiceNo) {
  if (doc.document_status === DOCUMENT_STATUS.CANCELLED) return { label: 'Cancelled', tone: 'danger' };
  if (kind === 'orders') {
    if (doc.document_status === DOCUMENT_STATUS.DRAFT) return { label: 'Draft', tone: 'neutral' };
    if (billedInvoiceNo) return { label: 'Billed', tone: 'success' };
    if (doc.repair_location_type !== REPAIR_LOCATION_TYPE.HEAD_OFFICE) return { label: 'At workshop', tone: 'info' };
    return doc.is_transferred
      ? { label: 'Sent to HO', tone: 'success' }
      : { label: 'Not sent to HO', tone: 'warning' };
  }
  if (kind === 'receipts' || kind === 'ins') {
    return doc.authorize
      ? { label: 'Authorised', tone: 'success' }
      : { label: 'Awaiting authorisation', tone: 'warning' };
  }
  if (kind === 'invoices') {
    if (doc.document_status === DOCUMENT_STATUS.DRAFT) return { label: 'Draft — not posted', tone: 'warning' };
    return (Number(doc.balance_amount) || 0) > 0.01
      ? { label: 'Posted · balance due', tone: 'warning' }
      : { label: 'Posted', tone: 'success' };
  }
  return doc.document_status === DOCUMENT_STATUS.DRAFT
    ? { label: 'Draft', tone: 'neutral' }
    : { label: 'Posted', tone: 'success' };
}
