'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import BottomSheet from '@/components/shared/BottomSheet';
import { sumRealGst } from '@/lib/gst';
import InvoiceReportButton from '@/components/features/checkout/InvoiceReportButton';
import FulfillOrderAction from '@/components/features/orders/FulfillOrderAction';
import { Button } from '@/components/ui/button';
import { useCancelOrder } from '@/hooks/orders/useCancelOrder';
import { useOrderDetail } from '@/hooks/checkout/useOrderDetail';
import { useInvoiceDetail } from '@/hooks/checkout/useInvoiceDetail';
import APP_CONFIG from '@/constants/appConfig';
import { formatAmountOrNull as formatCurrency } from '@/lib/priceUtils';
import { formatDateNumeric } from '@/lib/dateUtils';
import { resolveImageSrc } from '@/lib/resolveImageSrc';

function Row({ label, value, bold, border }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={`flex justify-between ${border ? 'border-t border-border pt-2' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? 'font-bold text-foreground' : 'font-medium text-foreground'}>
        {value}
      </span>
    </div>
  );
}

const STATUS_LABELS = {
  paid:    'Paid',
  partial: 'Partially Paid',
  due:     'Payment Due',
};

function OrderContent({ raw, status }) {
  if (!raw) return null;

  const lineItems = raw.line_items     ?? [];
  const payments  = raw.receipt_details ?? [];
  // Real, per-line CGST/SGST straight off this posted document's own line
  // items — never reconstructed (see lib/gst.js's own header).
  const gst       = sumRealGst(lineItems);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <Row label="Order No." value={raw.document_no} />
      <Row label="Date" value={formatDateNumeric(raw.document_date)} />
      <Row label="Customer" value={raw.party_name} />
      <Row label="Mobile"   value={raw.mobile} />
      <Row label="Email"    value={raw.email} />
      <Row label="Store"    value={raw.company_name} />
      <Row label="Status"   value={STATUS_LABELS[status] ?? null} />

      {lineItems.length > 0 && (
        <div className="border-t border-border pt-2 flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Items</span>
          {lineItems.map((item, i) => {
            const imageSrc = resolveImageSrc(item.image);
            const specs = [
              item.item_group_name,
              item.karat_name,
              item.metal_color_name,
              item.weight ? `${item.weight}g` : null,
              item.diamond_weight ? `${item.diamond_weight}ct` : null,
            ].filter(Boolean).join(' · ') || null;

            return (
              <div key={item.transaction_item_id ?? i} className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  {imageSrc && (
                    // eslint-disable-next-line @next/next/no-img-element -- small fixed thumbnail, not worth Next/Image's server-side optimization path here
                    <img
                      src={imageSrc}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-foreground/80 truncate">{item.item_name}</p>
                    {item.item_code && (
                      <p className="text-xs text-muted-foreground truncate">{item.item_code}</p>
                    )}
                    {specs && (
                      <p className="text-xs text-muted-foreground truncate">{specs}</p>
                    )}
                  </div>
                </div>
                <span className="font-medium text-foreground shrink-0">
                  {formatCurrency(item.gross_amount ?? item.net_amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* sub_total is the pre-tax amount, net_amount the final total —
          gross_amount does not exist on OrderRow. */}
      <Row label="Subtotal"   value={formatCurrency(raw.sub_total)} border />
      <Row label="Discount"   value={raw.discount ? `– ${formatCurrency(raw.discount)}` : null} />
      <Row label="CGST (1.5%)" value={gst && formatCurrency(gst.cgst)} />
      <Row label="SGST (1.5%)" value={gst && formatCurrency(gst.sgst)} />
      <Row label="Total"      value={formatCurrency(raw.net_amount)} bold border />
      <Row label="Received"   value={formatCurrency(raw.receipt_amount)} />
      <Row
        label="Balance Due"
        value={(raw.balance_amount ?? 0) > 0 ? formatCurrency(raw.balance_amount) : null}
      />

      {payments.length > 0 && (
        <div className="border-t border-border pt-2 flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Payments</span>
          {payments.map((p, i) => (
            <div key={p.receipt_id ?? i} className="flex justify-between gap-2">
              <span className="text-foreground/80">{p.mode_name}</span>
              <span className="font-medium text-foreground">{formatCurrency(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CancelConfirmBanner({ onConfirm, onDismiss, isPending }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="shrink-0 text-destructive mt-0.5" />
        <p className="text-sm text-destructive font-medium">
          Cancel this order? This cannot be undone.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          className="flex-1"
          disabled={isPending}
          onClick={onConfirm}
        >
          {isPending ? 'Cancelling…' : 'Yes, Cancel Order'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={isPending}
          onClick={onDismiss}
        >
          Keep Order
        </Button>
      </div>
    </div>
  );
}

export default function OrderDetailSheet({ order, isOpen, onClose }) {
  const isInvoice = order?.documentType === 'invoice';

  // Order/List and Invoice/List (what feeds every list this sheet is opened
  // from — /orders, the customer profile, the dashboard's Recent Orders)
  // never include line_items/full tax+item detail, only header summary
  // fields — confirmed live (2026-09-29): only Retrieve returns them.
  // Reported directly: "no product data visible... unsure what exactly the
  // payment is made for". Re-fetches the ONE full document by its
  // transaction_id as soon as the sheet opens for it; react-query caches by
  // id so re-opening the same order/invoice is instant on repeat views.
  const { order: orderDetail }     = useOrderDetail(!isInvoice ? order?.orderId : null);
  const { invoice: invoiceDetail } = useInvoiceDetail(isInvoice ? order?.orderId : null);

  // Falls back to the summary row while the detail fetch is in flight (or if
  // it fails) so the sheet never shows nothing — it just upgrades in place
  // once the full record lands.
  const raw = orderDetail ?? invoiceDetail ?? order?.raw ?? null;
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const cancelOrderMutation = useCancelOrder();

  const handleClose = () => {
    setShowCancelConfirm(false);
    onClose();
  };

  // Only show cancel for orders with an outstanding balance, and only for
  // the 'order' document type — this sheet also renders Invoice-origin rows
  // (see useAllOrders), which must not be cancelled via the Order endpoint.
  const isCancellable = !!(
    raw && order?.documentType !== 'invoice' &&
    (raw.balance_amount ?? 0) > 0 && raw.transaction_id
  );

  // Fulfillment doesn't require an outstanding balance (an order can be
  // fully paid and still await a made-to-order piece); same document-type
  // guard as Cancel.
  const isFulfillable = !!(raw && order?.documentType !== 'invoice' && raw.transaction_id);

  const handleConfirmCancel = async () => {
    if (!raw?.transaction_id) return;
    await cancelOrderMutation.mutateAsync(raw.transaction_id);
    setShowCancelConfirm(false);
    handleClose();
  };

  // 'invoice' rows print through document type 54, 'order' rows through 53.
  const printDocumentId = order?.documentType === 'invoice'
    ? APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE
    : APP_CONFIG.DOCUMENT_TYPES.POS_ORDER;
  const printDocumentLabel = order?.documentType === 'invoice' ? 'Invoice' : 'Order';

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Order">
      {raw ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <OrderContent raw={raw} status={order?.status} />
          </div>

          <InvoiceReportButton
            transactionId={raw.transaction_id}
            documentId={printDocumentId}
            documentLabel={printDocumentLabel}
          />

          {isFulfillable && <FulfillOrderAction raw={raw} />}

          {isCancellable && !showCancelConfirm && (
            <Button
              variant="outline"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setShowCancelConfirm(true)}
            >
              Cancel Order
            </Button>
          )}

          {isCancellable && showCancelConfirm && (
            <CancelConfirmBanner
              onConfirm={handleConfirmCancel}
              onDismiss={() => setShowCancelConfirm(false)}
              isPending={cancelOrderMutation.isPending}
            />
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          Order details unavailable.
        </p>
      )}
    </BottomSheet>
  );
}
