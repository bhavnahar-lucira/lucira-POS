'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AlertTriangle, CreditCard } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import { sumRealGst } from '@/lib/gst';
import InvoiceReportButton from '@/components/features/checkout/InvoiceReportButton';
import PaymentModeSelect from '@/components/shared/PaymentModeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCancelInvoice } from '@/hooks/invoices/useCancelInvoice';
import { useAddInvoiceReceipt } from '@/hooks/invoices/useAddInvoiceReceipt';
import { usePaymentModes } from '@/hooks/checkout/usePaymentModes';
import { paymentRequiresBank } from '@/lib/checkout/paymentModeRules';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { useInvoiceDetail } from '@/hooks/checkout/useInvoiceDetail';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
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

function InvoiceContent({ raw }) {
  const lineItems = raw?.line_items ?? [];
  const payments  = raw?.receipt_details ?? [];
  const gst       = sumRealGst(lineItems);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <Row label="Invoice No." value={raw.document_no} />
      <Row label="Date" value={formatDateNumeric(raw.document_date)} />
      <Row label="Customer" value={raw.party_name} />
      <Row label="Mobile"   value={raw.mobile} />
      <Row label="Email"   value={raw.email} />
      <Row label="Store"    value={raw.location_name ?? raw.company_name} />

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
          gross_amount does not exist on InvoiceRow. */}
      <Row label="Subtotal" value={formatCurrency(raw.sub_total)} border />
      <Row label="Discount" value={raw.discount ? `– ${formatCurrency(raw.discount)}` : null} />
      <Row label="CGST (1.5%)" value={gst && formatCurrency(gst.cgst)} />
      <Row label="SGST (1.5%)" value={gst && formatCurrency(gst.sgst)} />
      <Row label="Total"    value={formatCurrency(raw.net_amount)} bold border />
      <Row label="Received" value={formatCurrency(raw.receipt_amount)} />
      <Row
        label="Balance Due"
        value={(raw.balance_amount ?? 0) > 0 ? formatCurrency(raw.balance_amount) : null}
      />

      {payments.length > 0 && (
        <div className="border-t border-border pt-2 flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Payments</span>
          {payments.map((p) => (
            <div key={p.receipt_id} className="flex justify-between gap-2">
              <span className="text-foreground/80">{p.mode_name}</span>
              <span className="font-medium text-foreground">{formatCurrency(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollectPaymentPanel({ raw, onDone, onDismiss }) {
  const storeId = useSelector(selectActiveStoreId);
  const { paymentModes, isLoading: modesLoading } = usePaymentModes();
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE);
  const addReceipt = useAddInvoiceReceipt();

  const { control, register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      mode_id: '', amount: String(raw.balance_amount ?? 0),
      bank_pos_id: '', ref_no: '',
    },
  });
  const modeId = watch('mode_id');

  const onSubmit = async (data) => {
    const amount = Number(data.amount);
    if (!amount || amount <= 0) return;
    const mode = paymentModes.find((m) => m.modeId === Number(data.mode_id));
    
    if (mode && paymentRequiresBank(mode)) {
      if (!data.bank_pos_id) return toast.error('Select the bank account this payment settles to.');
      if (!data.ref_no?.trim()) return toast.error('Enter a reference number for this payment.');
    }
    await addReceipt.mutateAsync({
      transactionId:   raw.transaction_id,
      partyId:         raw.party_id,
      companyId:       storeId,
      financialYearId: headerConfig.financialYearId,
      mode,
      amount,
      bankPos: data.bank_pos_id || undefined,
      refNo:   data.ref_no?.trim() || undefined,
    });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold text-foreground">Collect Payment</p>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Amount (₹) <span className="text-destructive">*</span></label>
        <Input
          type="number" step="0.01" min="0" max={raw.balance_amount ?? undefined}
          {...register('amount', { required: true, min: 0.01 })}
          className="h-10"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Payment Mode <span className="text-destructive">*</span></label>
        <PaymentModeSelect
          control={control}
          name="mode_id"
          paymentModes={paymentModes}
          modesLoading={modesLoading}
          bankFieldName="bank_pos_id"
          refFieldName="ref_no"
        />
      </div>

      <div className="flex gap-2 mt-1">
        <Button type="submit" size="sm" className="flex-1" disabled={addReceipt.isPending || !modeId}>
          {addReceipt.isPending ? 'Recording…' : 'Record Payment'}
        </Button>
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onDismiss} disabled={addReceipt.isPending}>
          Cancel
        </Button>
      </div>
      {errors.amount && <p className="text-xs text-destructive">Enter a valid amount.</p>}
    </form>
  );
}

// ── Cancel confirmation inline banner — identical to OrderDetailSheet's ─
function CancelConfirmBanner({ onConfirm, onDismiss, isPending }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="shrink-0 text-destructive mt-0.5" />
        <p className="text-sm text-destructive font-medium">
          Cancel this invoice? This cannot be undone.
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
          {isPending ? 'Cancelling…' : 'Yes, Cancel Invoice'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={isPending}
          onClick={onDismiss}
        >
          Keep Invoice
        </Button>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   invoice: object | null,  // normalized invoice from useInvoiceList (with .raw)
 *   isOpen: boolean,
 *   onClose: () => void,
 * }} props
 */
export default function InvoiceDetailSheet({ invoice, isOpen, onClose }) {
  const { invoice: invoiceDetail } = useInvoiceDetail(invoice?.raw?.transaction_id ?? null);
  const raw = invoiceDetail ?? invoice?.raw;
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCollectPayment, setShowCollectPayment] = useState(false);

  const cancelInvoiceMutation = useCancelInvoice();

  const handleClose = () => {
    setShowCancelConfirm(false);
    setShowCollectPayment(false);
    onClose();
  };

  const hasBalance = !!(raw && (raw.balance_amount ?? 0) > 0 && raw.transaction_id);
  const isCancellable = !!(raw && raw.transaction_id);

  const handleConfirmCancel = async () => {
    if (!raw?.transaction_id) return;
    await cancelInvoiceMutation.mutateAsync(raw.transaction_id);
    setShowCancelConfirm(false);
    handleClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Invoice">
      {raw ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <InvoiceContent raw={raw} />
            </div>

            <InvoiceReportButton transactionId={raw.transaction_id} />

            {hasBalance && !showCollectPayment && !showCancelConfirm && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowCollectPayment(true)}
              >
                <CreditCard size={16} />
                Collect Payment
              </Button>
            )}

            {showCollectPayment && (
              <CollectPaymentPanel
                raw={raw}
                onDone={() => setShowCollectPayment(false)}
                onDismiss={() => setShowCollectPayment(false)}
              />
            )}

            {isCancellable && !showCancelConfirm && !showCollectPayment && (
              <Button
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
                onClick={() => setShowCancelConfirm(true)}
              >
                Cancel Invoice
              </Button>
            )}

            {isCancellable && showCancelConfirm && (
              <CancelConfirmBanner
                onConfirm={handleConfirmCancel}
                onDismiss={() => setShowCancelConfirm(false)}
                isPending={cancelInvoiceMutation.isPending}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Invoice details unavailable.
          </p>
        )}
    </BottomSheet>
  );
}
