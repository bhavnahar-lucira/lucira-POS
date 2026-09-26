'use client';

// Order/invoice confirmation screen. InvoiceRow/OrderRow field names don't
// match the obvious guess: document_no (not invoice_no), party_name (not
// customer_name), net_amount (not total_amount). Checkout can raise either
// an Invoice (paid in full) or an Order (a partial advance), so nothing
// here may assume "invoice" — a balance outstanding is a defect on one and
// the entire point of the other.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Confetti from '@/components/shared/Confetti';
import InvoiceReportButton from '@/components/features/checkout/InvoiceReportButton';
import { useInvoiceDetail } from '@/hooks/checkout/useInvoiceDetail';
import { useOrderDetail } from '@/hooks/checkout/useOrderDetail';
import { splitGst } from '@/lib/gst';
import APP_CONFIG from '@/constants/appConfig';
import { formatAmountOrDash as fmt } from '@/lib/priceUtils';
import { formatDateNumeric as fmtDate } from '@/lib/dateUtils';

/**
 * @param {{
 *   transactionId: number,   — EntityId returned from createInvoice/createOrder
 *   invoiceNo?:    string,   — document_no if already known (optional)
 *   documentType?: 'invoice'|'order',
 * }} props
 */
export default function OrderConfirmationScreen({
  transactionId, invoiceNo, documentType = 'invoice',
}) {
  const router = useRouter();
  const isOrder = documentType === 'order';

  // Mounts only right after a fresh order/invoice (checkout/page.jsx's
  // isConfirmed gate), so firing once per mount is once per sale.
  const [showConfetti, setShowConfetti] = useState(true);

  // Only the relevant Retrieve fires — the other is disabled by a null id
  // rather than skipped, so the hook order stays fixed across renders.
  const invoiceQuery = useInvoiceDetail(isOrder ? null : transactionId);
  const orderQuery   = useOrderDetail(isOrder ? transactionId : null);

  const invoice   = isOrder ? orderQuery.order     : invoiceQuery.invoice;
  const isLoading = isOrder ? orderQuery.isLoading : invoiceQuery.isLoading;

  const docLabel = isOrder ? 'Order' : 'Invoice';

  const displayNo   = invoice?.document_no  ?? invoiceNo ?? transactionId;
  const customerName= invoice?.party_name   ?? null;     // party_name, NOT customer_name
  const totalAmount = invoice?.net_amount   ?? null;     // net_amount, NOT total_amount
  const invoiceDate = invoice?.document_date ?? null;
  const receiptAmt  = invoice?.receipt_amount ?? null;
  // Nector Loyalty (like Exchange/Scheme/Old Gold/Advance before it) is a
  // real receipt_details[] row on the posted document now — OrnaVerse's own
  // balance_amount already accounts for it correctly, same as it already
  // did for those. No client-side reconciliation needed.
  const balanceAmt  = invoice?.balance_amount ?? null;
  // Read straight off the retrieved document's own `discount` field
  // (matches what Create submitted) rather than re-derived from client
  // promo state.
  const discountAmt = invoice?.discount || null;
  // Server-computed GST, read back per line item and split into CGST+SGST
  // for display (lib/gst.js) — not calculated client-side.
  const taxAmount   = invoice?.tax_amount ?? null;
  const gst         = splitGst(taxAmount);
  // Same round_off figure submitted at Create (roundedNet - netAmount),
  // read back rather than recomputed, so Discount + CGST + SGST lines add
  // up to Total instead of being off by a few paise.
  const roundOffAmt = invoice?.round_off ?? null;

  const handleNewSale = () => {
    router.push('/catalog');
  };

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-10 text-center">
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}

      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-in-stock/15">
        <CheckCircle2 size={36} className="text-status-in-stock" aria-hidden="true" />
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground">
          {isOrder ? 'Order placed' : 'Sale completed'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{docLabel} #{displayNo}</p>
      </div>

      <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 text-left shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Loading invoice…
          </div>
        ) : invoice ? (
          <div className="flex flex-col gap-2 text-sm">
            {invoiceDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="text-foreground/80">{fmtDate(invoiceDate)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{docLabel} No.</span>
              <span className="font-medium text-foreground">{displayNo}</span>
            </div>
            {customerName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium text-foreground">{customerName}</span>
              </div>
            )}
            {discountAmt != null && discountAmt > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-status-in-stock font-medium">-{fmt(discountAmt)}</span>
              </div>
            )}
            {gst && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST (1.5%)</span>
                  <span className="text-foreground/80">{fmt(gst.cgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST (1.5%)</span>
                  <span className="text-foreground/80">{fmt(gst.sgst)}</span>
                </div>
              </>
            )}
            {roundOffAmt != null && roundOffAmt !== 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round Off</span>
                <span className="text-foreground/80">
                  {roundOffAmt > 0 ? '+' : '−'}{fmt(Math.abs(roundOffAmt))}
                </span>
              </div>
            )}
            {totalAmount != null && (
              <div className="flex justify-between border-t border-border pt-2 mt-1">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold text-foreground">{fmt(totalAmount)}</span>
              </div>
            )}
            {receiptAmt != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isOrder ? 'Advance paid' : 'Paid'}</span>
                <span className="text-status-in-stock font-medium">{fmt(receiptAmt)}</span>
              </div>
            )}
            {/* On an order this is the expected remainder, collected when the
                piece is handed over — not an error state, so it isn't red. */}
            {balanceAmt != null && balanceAmt > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {isOrder ? 'Balance on collection' : 'Balance Due'}
                </span>
                <span className={`font-medium ${isOrder ? 'text-foreground/80' : 'text-status-error'}`}>
                  {fmt(balanceAmt)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Invoice details unavailable.</p>
        )}
      </div>

      {/* The old "Download Invoice PDF" button is gone — OrnaVerse's
          GeneratePDF endpoint 500s and never worked. See InvoiceReportButton. */}
      <div className="flex w-full max-w-md flex-col gap-2">
        <InvoiceReportButton
          transactionId={transactionId}
          documentId={isOrder
            ? APP_CONFIG.DOCUMENT_TYPES.POS_ORDER
            : APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE}
          documentLabel={docLabel}
        />
        <Button
          type="button"
          onClick={handleNewSale}
          className="h-12 w-full text-base font-semibold"
        >
          New Sale
        </Button>
      </div>
    </div>
  );
}