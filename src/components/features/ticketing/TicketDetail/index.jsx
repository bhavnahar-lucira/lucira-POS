'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Check, CheckCircle2, Calculator, MessageSquareWarning, Pencil, XCircle } from 'lucide-react';

import TicketFileThumb from '@/components/features/ticketing/TicketFileThumb';
import TicketRequestFields, { NameSelect, specsFromTicket } from '@/components/features/ticketing/TicketRequestFields';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTicketAction } from '@/hooks/ticketing/useTickets';
import { useMetalRates } from '@/hooks/settings/useMetalRates';
import { useAttributeOptions, useKaratOptions } from '@/hooks/catalog/useCatalogFilterOptions';
import APP_CONFIG from '@/constants/appConfig';
import { TICKET_STATUS, advanceModeFields, goldKarat, ticketStatusLabel } from '@/lib/ticketing/constants';
import { useSelector } from 'react-redux';
import BankPosSelect from '@/components/features/checkout/BankPosSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePaymentModes } from '@/hooks/checkout/usePaymentModes';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { createAdvanceReceipt } from '@/services/advanceReceiptService';
import { paymentRequiresBank } from '@/lib/checkout/paymentModeRules';
import { resolveDocumentDateTime } from '@/lib/dateUtils';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';
import { formatAmountOrDash } from '@/lib/priceUtils';

const STATUS_TONES = {
  awaiting_g2d:               'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  g2d_shared:                 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  awaiting_cad:               'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  awaiting_customer_feedback: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  final_received:             'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  awaiting_final:             'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  order_placed:               'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  cancelled:                  'bg-destructive/10 text-destructive',
};

const STAGES = [
  { key: 'raised',  label: 'Request raised' },
  { key: 'g2d',     label: 'G2D estimate' },
  { key: 'advance', label: 'G2D approval & advance' },
  { key: 'design',  label: 'CAD design' },
  { key: 'cad_ok',  label: 'CAD approval' },
  { key: 'final',   label: 'Final details & SKU' },
  { key: 'order',   label: 'Order placed' },
];

const STAGE_BY_STATUS = {
  awaiting_g2d:               1,
  g2d_shared:                 2,
  awaiting_cad:               3,
  awaiting_customer_feedback: 4,
  awaiting_final:             5,
  final_received:             6,
  order_placed:               6,
};

const ACTION_LABELS = {
  ticket_created:     'Ticket created',
  request_updated:    'Request updated',
  share_g2d_estimate: 'G2D estimate shared by CAD team',
  g2d_approved:       'Customer approved G2D – order confirmed',
  g2d_rejected:       'G2D changes requested',
  design_shared:      'Design shared by CAD team',
  share_cad_design:   'CAD design shared by CAD team',
  order_created:      'Final details sent · manufacturing order created by workflow team',
  design_approved:    'Design approved',
  design_rejected:    'Design changes requested',
  ticket_cancelled:   'Ticket cancelled',
  pos_order_placed:   'Order placed in OrnaVerse',
};

const SPEC_LABELS = [
  ['category', 'Category'], ['size', 'Size'], ['budget', 'Budget'],
  ['karat', 'Karat'], ['metal', 'Metal color'], ['gold_weight', 'Metal weight (g)'],
];


const formatDateTime = (value) => (value
  ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');

// OrnaVerse keeps birthdays/anniversaries as day + month with year 0001 when the year isn't known.
const formatProfileDate = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...(d.getFullYear() > 1900 && { year: 'numeric' }) });
};

const formatSpec = (key, value) => {
  if (value == null || value === '') return '—';
  return key === 'budget' ? formatAmountOrDash(value) : String(value);
};

const designFiles = (design) => design.files.map((f) => ({
  ...f,
  type: /\.pdf($|\?)/i.test(f.url) ? 'application/pdf' : 'image/*',
}));

const versionText = (version) => `V${String(version).replace(/^v/i, '')}`;

export function TicketStatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONES[status] ?? 'bg-muted text-muted-foreground'}`}>
      {ticketStatusLabel(status)}
    </span>
  );
}

function StageTracker({ status }) {
  const current = STAGE_BY_STATUS[status] ?? 0;
  return (
    <ol className="flex items-start overflow-x-auto rounded-xl border border-border bg-card p-4 sm:p-5">
      {STAGES.map((stage, i) => {
        const done = i < current || (status === TICKET_STATUS.ORDER_PLACED && i === current);
        const active = i === current && !done;
        return (
          <li key={stage.key} className="flex min-w-24 flex-1 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : i <= current ? 'bg-primary' : 'bg-border'}`} />
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                  done ? 'border-primary bg-primary text-primary-foreground'
                    : active ? 'border-primary bg-background text-primary'
                      : 'border-border bg-background text-muted-foreground'}`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check size={14} aria-hidden="true" /> : i + 1}
              </span>
              <span className={`h-0.5 flex-1 ${i === STAGES.length - 1 ? 'invisible' : i < current ? 'bg-primary' : 'bg-border'}`} />
            </div>
            <span className={`px-1 text-xs ${active ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoGrid({ items, columns = 'sm:grid-cols-2 lg:grid-cols-3' }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 text-sm ${columns}`}>
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-foreground wrap-break-word whitespace-pre-line">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TextBlock({ label, children }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="rounded-lg bg-muted/50 p-3 text-foreground whitespace-pre-line wrap-break-word">{children}</p>
    </div>
  );
}

function ReasonDialog({ isOpen, onOpenChange, title, description, label, confirmLabel, confirmVariant = 'default', isPending, onConfirm }) {
  const [text, setText] = useState('');
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) setText(''); onOpenChange(open); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-reason">{label} <span className="text-destructive">*</span></Label>
          <Textarea id="ticket-reason" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Back</Button>
          <Button
            type="button"
            variant={confirmVariant}
            className="h-11"
            disabled={isPending || text.trim().length < 3}
            onClick={() => onConfirm(text.trim())}
          >
            {isPending ? 'Saving…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepCard({ step, title, isCurrent, prompt, actions, children }) {
  return (
    <Card
      title={`${step} · ${title}`}
      className={isCurrent ? 'ring-2 ring-primary/40' : ''}
      action={isCurrent && actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    >
      {isCurrent && prompt && <p className="rounded-lg bg-primary/5 p-3 text-sm text-foreground">{prompt}</p>}
      {children}
    </Card>
  );
}

function DecisionTag({ decision }) {
  if (decision === 'approved') return <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Approved</span>;
  if (decision === 'rejected') return <span className="text-xs font-medium text-destructive">Changes requested</span>;
  return null;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function FormField({ label, htmlFor, required, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label htmlFor={htmlFor}>{label} {required && <span className="text-destructive">*</span>}</Label>
      {children}
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:p-4">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

const formatQty = (value, unit) => (value == null || value === '' ? '—' : `${value}${unit ? ` ${unit}` : ''}`);

const LABOUR_TYPE_LABELS = { per_gram: 'Per gram', percentage: 'Percentage', fixed: 'Fixed' };

function FinalDetails({ details }) {
  const { lineItem = {}, metal, stones = [], labour } = details;
  return (
    <div className="flex flex-col gap-4">
      <InfoGrid
        items={[
          ['Received', `${formatDateTime(details.received_at)}${details.received_by ? ` by ${details.received_by}` : ''}`],
          ['Manufacturing order (panel)', details.manufacturing_order_number ?? '—'],
          ['Panel status', details.panel_status_label ?? '—'],
          ['SKU', lineItem.sku ?? details.sku ?? 'Not received yet'],
        ]}
      />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Item</span>
        <div className="flex flex-wrap items-start gap-3">
          {lineItem.image && <TicketFileThumb file={{ url: lineItem.image, file_name: lineItem.item_name ?? 'Final design', type: 'image/*' }} />}
          <InfoGrid
            items={[
              ['Item', lineItem.item_name ?? '—'],
              ['Category', lineItem.category ?? '—'],
              ['Size', lineItem.item_size_name ?? '—'],
              ['Weight', formatQty(lineItem.weight, 'g')],
            ]}
          />
        </div>
      </div>

      {metal && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Metal</span>
          <InfoGrid
            items={[
              ['Karat / colour', [metal.karat, metal.color].filter(Boolean).join(' ') || '—'],
              ['Weight', formatQty(metal.weight, 'g')],
              ['Purity', formatQty(metal.purity)],
              ['Rate (₹/g)', formatAmountOrDash(metal.rate)],
              ['Amount', formatAmountOrDash(metal.amount)],
            ]}
          />
        </div>
      )}

      {stones.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Diamonds / stones</span>
          {stones.map((s, i) => (
            <div key={s.id ?? i} className="rounded-lg border border-border p-3">
              <InfoGrid
                items={[
                  ['Group', s.group ?? '—'],
                  ['Type', s.type ?? '—'],
                  ['Shape', s.shape ?? '—'],
                  ['Colour / quality', [s.color, s.quality].filter(Boolean).join(' / ') || '—'],
                  ['Pieces / weight', `${s.pieces ?? '—'} pcs · ${formatQty(s.weight, 'ct')}`],
                  ['Rate (₹/ct) · amount', `${formatAmountOrDash(s.rate)} · ${formatAmountOrDash(s.amount)}`],
                ]}
              />
            </div>
          ))}
        </div>
      )}

      {labour && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Labour</span>
          <InfoGrid
            items={[
              ['Type', LABOUR_TYPE_LABELS[labour.type] ?? labour.type ?? '—'],
              ['Rate', labour.ratePerGram != null ? `${formatAmountOrDash(labour.ratePerGram)}/g` : formatAmountOrDash(labour.rate)],
              ['Amount', formatAmountOrDash(labour.amount)],
            ]}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3 text-sm">
        {[
          ['Sub total', details.subTotal],
          ['Tax', details.taxAmount],
          ['Round off', details.roundOff],
          ['Net amount', details.netAmount],
          ['Amount received', details.amountReceived],
          ['Balance', details.balanceAmount],
        ].map(([label, value]) => (
          <div key={label} className={`flex justify-between ${label === 'Net amount' ? 'border-t border-border pt-1.5 font-semibold' : ''}`}>
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums">{formatAmountOrDash(value)}</span>
          </div>
        ))}
      </div>

      {details.orderNotes && <TextBlock label="Order notes">{details.orderNotes}</TextBlock>}
    </div>
  );
}

function ConfirmOrderDialog({ ticket, isOpen, onOpenChange, isPending, onSave, advanceReceiptId, onReceiptCreated }) {
  const requested = ticket.requested_specs ?? {};
  const [order, setOrder] = useState(() => ({
    order_date: todayIso(),
    order_amount: '',
    amount_received: '',
    advance_received_on: todayIso(),
    payment_mode_id: '',
    bank_pos_id: '',
    reference_no: '',
    payment_details: {},
    expected_delivery_date: '',
    karat: ticket.specs?.karat ?? requested.karat ?? '',
    metal: ticket.specs?.metal ?? requested.metal ?? '',
    size: ticket.specs?.size ?? requested.size ?? '',
    description: ticket.specs?.description ?? requested.description ?? '',
    remarks: '',
  }));
  const set = (key) => (e) => setOrder({ ...order, [key]: e?.target ? e.target.value : e });
  const setDetail = (key) => (e) => setOrder({ ...order, payment_details: { ...order.payment_details, [key]: e.target.value } });

  const { options: metalOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.METAL_COLOR);
  const { options: karatOptions } = useKaratOptions();
  const rateCode = goldKarat(order.karat)?.rateCode;
  const { rates, isLoading: isRateLoading } = useMetalRates(rateCode ? [rateCode] : []);
  const goldRate = rateCode ? rates[0]?.rate ?? null : null;

  const hasAdvance = Number(order.amount_received) > 0;
  const storeId = useSelector(selectActiveStoreId);
  const receiptHeader = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.POS_RECEIPT);
  const { paymentModes, isLoading: modesLoading } = usePaymentModes();
  const advanceModes = paymentModes.filter((m) => m.modeType !== APP_CONFIG.PAYMENT_MODES.LOYALTY_MODE_TYPE);
  const mode = advanceModes.find((m) => m.modeId === Number(order.payment_mode_id)) ?? null;
  const needsBank = !!mode && paymentRequiresBank(mode);
  const modeFields = advanceModeFields(mode?.modeName);
  const [isCreatingReceipt, setIsCreatingReceipt] = useState(false);
  const receiptLocked = !!advanceReceiptId;
  const missing = [
    !order.order_date && 'order date',
    !(Number(order.order_amount) > 0) && 'order amount',
    !order.expected_delivery_date && 'expected delivery date',
    !order.karat && 'karat',
    !goldRate && "today's gold rate",
    hasAdvance && !order.advance_received_on && 'advance received date',
    hasAdvance && !mode && 'payment mode',
    hasAdvance && needsBank && !order.bank_pos_id && 'bank account',
    hasAdvance && needsBank && !order.reference_no?.trim() && 'reference number',
    ...(hasAdvance ? modeFields : [])
      .filter((f) => f.required && !order.payment_details[f.key]?.trim())
      .map((f) => f.label.toLowerCase()),
    hasAdvance && order.payment_details.card_last4 && !/^\d{4}$/.test(order.payment_details.card_last4) && 'valid card last 4 digits',
  ].filter(Boolean);

  // The advance becomes a real OrnaVerse advance receipt first, so checkout can adjust it against the order.
  // A receipt already created for this ticket (e.g. a retry after an error) is reused, never created twice.
  const handleSubmit = async () => {
    let receiptId = advanceReceiptId;
    if (hasAdvance && !receiptId) {
      if (!receiptHeader.isReady) {
        if (receiptHeader.isError) receiptHeader.refetch();
        return toast.error(receiptHeader.isConfigMissing
          ? "Advance receipts aren't set up for this store yet — contact OrnaVerse support."
          : 'Store configuration is still loading — try again in a moment.');
      }
      setIsCreatingReceipt(true);
      try {
        const res = await createAdvanceReceipt({
          partyId: ticket.customer_party_id,
          activeStoreId: storeId,
          financialYearId: receiptHeader.financialYearId,
          ledgerId: receiptHeader.ledgerId,
          numberOfBackdatedDays: receiptHeader.numberOfBackdatedDays,
          documentDate: resolveDocumentDateTime(order.advance_received_on).toISOString(),
          narration: `Advance for custom order ticket ${ticket.ticket_number}`,
          payout: {
            modeId: mode.modeId,
            ledgerId: mode.ledgerId,
            amount: Number(order.amount_received),
            bankPos: needsBank ? order.bank_pos_id : undefined,
            refNo: needsBank ? order.reference_no.trim() : undefined,
          },
        });
        receiptId = res?.EntityId;
        if (!receiptId) throw new Error('OrnaVerse did not return the advance receipt.');
        onReceiptCreated(receiptId);
        toast.success('Advance receipt created in OrnaVerse.');
      } catch (err) {
        toast.error(err?.response?.data?.Error?.Message ?? err?.message ?? 'The advance receipt could not be created.');
        return;
      } finally {
        setIsCreatingReceipt(false);
      }
    }
    onSave({ ...order, payment_mode: mode?.modeName ?? null, advance_receipt_id: receiptId });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customer approved – confirm order</DialogTitle>
          <DialogDescription>{ticket.ticket_number} · {ticket.customer_name} · {ticket.store_name}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-foreground">Moves to <strong>CAD design in progress</strong> – goes to <strong>CAD</strong>.</p>
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          After this, product and commercial details are locked.
        </p>

        <FormSection title="Order details">
          <FormField label="Order date" htmlFor="co-date" required>
            <Input id="co-date" className="h-11" type="date" max={todayIso()} value={order.order_date} onChange={set('order_date')} />
          </FormField>
          <FormField label="Order amount (₹)" htmlFor="co-amount" required>
            <Input id="co-amount" className="h-11" type="number" min="0" inputMode="decimal" value={order.order_amount} onChange={set('order_amount')} />
          </FormField>
          <FormField label={`Gold rate (₹/g)${order.karat ? ` · today, ${order.karat}` : ''}`} htmlFor="co-rate" required>
            <Input
              id="co-rate"
              className="h-11 bg-muted/50"
              readOnly
              aria-readonly="true"
              value={goldRate ? formatAmountOrDash(goldRate) : isRateLoading ? 'Fetching today’s rate…' : 'Not available for this karat'}
            />
          </FormField>
          <FormField label="Expected delivery date" htmlFor="co-delivery" required>
            <Input id="co-delivery" className="h-11" type="date" min={todayIso()} value={order.expected_delivery_date} onChange={set('expected_delivery_date')} />
          </FormField>
          <FormField label="Karat" htmlFor="co-karat" required>
            <NameSelect id="co-karat" value={order.karat} onChange={set('karat')} options={karatOptions.map((o) => o.label)} placeholder="Select karat" />
          </FormField>
          <FormField label="Metal" htmlFor="co-metal">
            <NameSelect id="co-metal" value={order.metal} onChange={set('metal')} options={metalOptions.map((o) => o.label)} placeholder="Select color" />
          </FormField>
          <FormField label="Size" htmlFor="co-size">
            <Input id="co-size" className="h-11" maxLength={100} value={order.size} onChange={set('size')} />
          </FormField>
          <FormField label="Description / discount & offer" htmlFor="co-description" className="sm:col-span-2">
            <Textarea id="co-description" rows={3} maxLength={2000} value={order.description} onChange={set('description')} />
          </FormField>
          <FormField label="Remarks" htmlFor="co-remarks" className="sm:col-span-2">
            <Textarea id="co-remarks" rows={3} maxLength={1000} value={order.remarks} onChange={set('remarks')} />
          </FormField>
        </FormSection>

        <FormSection title="Advance payment">
          {receiptLocked && (
            <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground sm:col-span-2">
              The advance receipt is already created in OrnaVerse — Submit links it to this ticket.
            </p>
          )}
          <FormField label="Amount received (₹)" htmlFor="co-received">
            <Input id="co-received" className="h-11" type="number" min="0" inputMode="decimal" disabled={receiptLocked} value={order.amount_received} onChange={set('amount_received')} />
          </FormField>
          <FormField label="Advance received date" htmlFor="co-adv-date" required={hasAdvance}>
            <Input id="co-adv-date" className="h-11" type="date" max={todayIso()} disabled={receiptLocked} value={order.advance_received_on} onChange={set('advance_received_on')} />
          </FormField>
          <FormField label="Payment mode" htmlFor="co-mode" required={hasAdvance}>
            <Select value={order.payment_mode_id ? String(order.payment_mode_id) : ''} onValueChange={set('payment_mode_id')} disabled={modesLoading || receiptLocked}>
              <SelectTrigger id="co-mode" className="h-11 w-full">
                <SelectValue placeholder={modesLoading ? 'Loading…' : 'Select payment mode'} />
              </SelectTrigger>
              <SelectContent>
                {advanceModes.map((m) => <SelectItem key={m.modeId} value={String(m.modeId)}>{m.modeName}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          {needsBank && (
            <>
              <FormField label="Bank account" htmlFor="co-bank" required={hasAdvance}>
                <BankPosSelect value={order.bank_pos_id || null} onChange={set('bank_pos_id')} />
              </FormField>
              <FormField label="Reference number" htmlFor="co-ref" required={hasAdvance}>
                <Input id="co-ref" className="h-11" maxLength={100} disabled={receiptLocked} value={order.reference_no} onChange={set('reference_no')} placeholder="UPI / card / bank reference" />
              </FormField>
            </>
          )}
          {modeFields.map((field) => (
            <FormField key={field.key} label={field.label} htmlFor={`co-pay-${field.key}`} required={hasAdvance && field.required}>
              <Input
                id={`co-pay-${field.key}`}
                className="h-11"
                inputMode={field.type === 'last4' ? 'numeric' : undefined}
                maxLength={field.type === 'last4' ? 4 : 100}
                value={order.payment_details[field.key] ?? ''}
                onChange={setDetail(field.key)}
              />
            </FormField>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            The advance is booked as an OrnaVerse advance receipt for {ticket.customer_name}; at checkout use “Advance Paid” to adjust it against the order. Card details are kept in the POS record only.
          </p>
        </FormSection>

        {missing.length > 0 && (
          <p className="text-xs text-muted-foreground">To submit, fill in: {missing.join(', ')}.</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="h-11" disabled={isPending || isCreatingReceipt || missing.length > 0} onClick={handleSubmit}>
            {isCreatingReceipt ? 'Creating advance receipt…' : isPending ? 'Submitting…' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRequestDialog({ ticket, isOpen, onOpenChange, isPending, onSave }) {
  const [specs, setSpecs] = useState(() => specsFromTicket(ticket.requested_specs));
  const [files, setFiles] = useState([]);
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Update request</DialogTitle>
          <DialogDescription>Changes are sent to the CAD team and recorded in the ticket history.</DialogDescription>
        </DialogHeader>
        <TicketRequestFields
          specs={specs}
          onSpecsChange={setSpecs}
          files={files}
          onFilesChange={setFiles}
          existingFileCount={ticket.reference_images?.length ?? 0}
        />
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="h-11" disabled={isPending} onClick={() => onSave({ specs, file_ids: files.map((f) => f.id) })}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Full ticket view. partyId is passed when opened from a customer's profile (cross-store access). */
export default function TicketDetail({ ticket, partyId }) {
  const action = useTicketAction(ticket.ticket_number, { partyId });
  const [dialog, setDialog] = useState(null);
  const [advanceReceiptId, setAdvanceReceiptId] = useState(null);

  const run = (payload, successMessage) => action.mutate(payload, {
    onSuccess: () => {
      toast.success(successMessage);
      setDialog(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const { status } = ticket;
  const designs = ticket.designs ?? [];
  const g2d = ticket.g2d_estimates ?? [];
  const requested = ticket.requested_specs ?? ticket.specs ?? {};
  const latest = designs[0];
  const latestG2d = g2d[0];
  const orderDetails = ticket.order_details;
  const isCancelled = status === TICKET_STATUS.CANCELLED;
  const canDecideG2d = status === TICKET_STATUS.G2D_SHARED && latestG2d && !latestG2d.customer_decision;
  const canDecideDesign = status === TICKET_STATUS.AWAITING_CUSTOMER_FEEDBACK && latest && !latest.customer_decision;
  const history = [...(ticket.history ?? [])].reverse();
  const profile = ticket.customer_profile;

  const decisionButtons = (onReject, onApprove, approveLabel) => (
    <>
      <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={onReject}>
        <MessageSquareWarning size={16} aria-hidden="true" /> Request changes
      </Button>
      <Button type="button" className="h-11 gap-1.5" onClick={onApprove}>
        <CheckCircle2 size={16} aria-hidden="true" /> {approveLabel}
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">{ticket.ticket_number}</h1>
            <TicketStatusBadge status={status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {ticket.customer_name} · {requested.category ?? '—'} · Raised {formatDateTime(ticket.created_at)}
          </p>
        </div>
        {!isCancelled && (
          <Button type="button" variant="outline" className="h-11 gap-1.5 text-destructive hover:text-destructive" onClick={() => setDialog('cancel')}>
            <XCircle size={16} aria-hidden="true" /> Cancel ticket
          </Button>
        )}
      </div>

      {isCancelled ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm flex flex-col gap-1">
          <p className="font-medium text-destructive">
            Cancelled {formatDateTime(ticket.cancelled_at)}{ticket.cancelled_by ? ` by ${ticket.cancelled_by}` : ''}
          </p>
          {ticket.cancel_reason && <p className="text-foreground whitespace-pre-line">Reason: {ticket.cancel_reason}</p>}
        </div>
      ) : (
        <StageTracker status={status} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <StepCard
            step={1}
            title="Customer requirement"
            isCurrent={status === TICKET_STATUS.AWAITING_G2D}
            prompt="Waiting for the CAD team's G2D estimate. The request can still be updated until it is shared."
            actions={(
              <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => setDialog('edit')}>
                <Pencil size={16} aria-hidden="true" /> Update request
              </Button>
            )}
          >
            <InfoGrid items={SPEC_LABELS.map(([key, label]) => [label, formatSpec(key, requested[key])])} />
            {requested.requirement_notes && <TextBlock label="Requirement">{requested.requirement_notes}</TextBlock>}
            {requested.description && <TextBlock label="Description / discount & offer">{requested.description}</TextBlock>}
            {ticket.reference_images?.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Reference images</span>
                <div className="flex flex-wrap gap-2">
                  {ticket.reference_images.map((file) => <TicketFileThumb key={file.id ?? file.url} file={file} />)}
                </div>
              </div>
            )}
          </StepCard>

          <StepCard
            step={2}
            title="G2D estimate"
            isCurrent={canDecideG2d}
            prompt={latestG2d && `The CAD team has shared G2D round ${latestG2d.round}. Show it to the customer, then confirm the order once they approve, or send it back with the changes they want.`}
            actions={decisionButtons(() => setDialog('reject_g2d'), () => setDialog('approve_g2d'), 'Customer approved – confirm order')}
          >
            {g2d.length === 0 ? (
              <p className="text-sm text-muted-foreground">The CAD team hasn&apos;t shared the G2D estimate yet.</p>
            ) : g2d.map((estimate) => (
              <div key={estimate.round} className="flex flex-col gap-3 border-t border-border pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">Round {estimate.round}</span>
                  {estimate === latestG2d && g2d.length > 1 && <span className="text-xs font-medium text-violet-700 dark:text-violet-300">Latest</span>}
                  <span className="text-xs text-muted-foreground">{formatDateTime(estimate.at)} by {estimate.by}</span>
                  <DecisionTag decision={estimate.customer_decision} />
                </div>
                {estimate.changes.length > 0 && (
                  <InfoGrid
                    items={estimate.changes.map((c) => [
                      c.field,
                      `${c.to ?? '—'}${c.from && c.from !== c.to ? ` (requested ${c.from})` : ''}`,
                    ])}
                  />
                )}
                {estimate.note && <TextBlock label="CAD remarks">{estimate.note}</TextBlock>}
                {estimate.files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {designFiles(estimate).map((file) => <TicketFileThumb key={file.url} file={file} />)}
                  </div>
                )}
                {estimate.customer_feedback && (
                  <p className="rounded-lg bg-muted/50 p-2 text-sm whitespace-pre-line">
                    <span className="text-xs text-muted-foreground">Changes requested: </span>{estimate.customer_feedback}
                  </p>
                )}
              </div>
            ))}
            {orderDetails && (
              <div className="flex flex-col gap-2 rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                <span className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Order confirmed by customer</span>
                <InfoGrid
                  items={[
                    ['Order date', formatProfileDate(orderDetails.order_date)],
                    ['Order amount', formatAmountOrDash(orderDetails.order_amount)],
                    ['Amount received', formatAmountOrDash(orderDetails.amount_received)],
                    ['Advance received', formatProfileDate(orderDetails.advance_received_on)],
                    ['Payment mode', orderDetails.payment_mode ?? '—'],
                    ['Advance receipt', orderDetails.advance_receipt?.document_no ?? '—'],
                    ['Reference no.', orderDetails.reference_no ?? '—'],
                    ...advanceModeFields(orderDetails.payment_mode)
                      .filter((f) => orderDetails.payment_details?.[f.key])
                      .map((f) => [f.label, orderDetails.payment_details[f.key]]),
                    ['Gold rate (₹/g)', formatAmountOrDash(orderDetails.gold_rate)],
                    ['Expected delivery', formatProfileDate(orderDetails.expected_delivery_date)],
                    ['Metal', [orderDetails.karat, orderDetails.metal].filter(Boolean).join(' ') || '—'],
                    ['Size', orderDetails.size ?? '—'],
                  ]}
                />
                {orderDetails.description && <TextBlock label="Description / discount & offer">{orderDetails.description}</TextBlock>}
                {orderDetails.remarks && <TextBlock label="Remarks">{orderDetails.remarks}</TextBlock>}
                <p className="text-xs text-muted-foreground">Confirmed {formatDateTime(orderDetails.confirmed_at)} by {orderDetails.confirmed_by}</p>
              </div>
            )}
          </StepCard>

          <StepCard
            step={3}
            title="CAD design"
            isCurrent={canDecideDesign}
            prompt={latest && `The CAD team has shared design ${latest.label}. Show it to the customer and record their decision.`}
            actions={latest && decisionButtons(() => setDialog('reject'), () => setDialog('approve'), `Approve ${latest.label}`)}
          >
            {ticket.cad_remarks && <TextBlock label="CAD remarks">{ticket.cad_remarks}</TextBlock>}
            {designs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {status === TICKET_STATUS.AWAITING_CAD ? 'The CAD team is working on the design.' : 'The CAD design follows once the G2D estimate is approved.'}
              </p>
            ) : designs.map((design) => (
              <div key={design.version} className="flex flex-col gap-2 border-t border-border pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{design.label}</span>
                  {design === latest && designs.length > 1 && <span className="text-xs font-medium text-sky-700 dark:text-sky-300">Latest</span>}
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(design.uploaded_at)}{design.uploaded_by ? ` by ${design.uploaded_by}` : ''}
                  </span>
                  <DecisionTag decision={design.customer_decision} />
                </div>
                {design.cad_notes && <p className="text-sm text-muted-foreground whitespace-pre-line">{design.cad_notes}</p>}
                {design.files.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {designFiles(design).map((file) => <TicketFileThumb key={file.url} file={file} />)}
                  </div>
                ) : <p className="text-xs text-muted-foreground">No design file attached to this version.</p>}
                {design.customer_feedback && (
                  <p className="rounded-lg bg-muted/50 p-2 text-sm whitespace-pre-line">
                    <span className="text-xs text-muted-foreground">Customer feedback: </span>{design.customer_feedback}
                  </p>
                )}
              </div>
            ))}
          </StepCard>

          <StepCard
            step={4}
            title="Final details & order"
            isCurrent={[TICKET_STATUS.AWAITING_FINAL, TICKET_STATUS.FINAL_RECEIVED].includes(status)}
            prompt={status === TICKET_STATUS.FINAL_RECEIVED
              ? 'Final details received. Create the estimate, then proceed to checkout to apply offers and place the order.'
              : 'Design approved. Waiting for the team to send the final details.'}
            actions={status === TICKET_STATUS.FINAL_RECEIVED && (
              <Button asChild className="h-11 gap-1.5">
                <Link href={`/estimation?ticket=${encodeURIComponent(ticket.ticket_number)}`}>
                  <Calculator size={16} aria-hidden="true" /> Create estimate
                </Link>
              </Button>
            )}
          >
            {ticket.pos_order?.document_no && (
              <InfoGrid
                items={[
                  ['Order no.', ticket.pos_order.document_no],
                  ['Order placed', formatDateTime(ticket.pos_order.placed_at)],
                ]}
              />
            )}
            {ticket.final_details ? (
              <FinalDetails details={ticket.final_details} />
            ) : (
              <p className="text-sm text-muted-foreground">The final details, will appear here once the team sends them.</p>
            )}
          </StepCard>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Customer">
            <InfoGrid
              columns="sm:grid-cols-2 lg:grid-cols-1"
              items={[
                ['Name', ticket.customer_name],
                ['Customer code', profile?.party_code ?? '—'],
                ['Mobile', ticket.customer_mobile ? formatMobileWithCountryCode(ticket.customer_mobile) : '—'],
                ['City', [profile?.city_name, profile?.state_name].filter(Boolean).join(', ') || '—'],
                ['Birthday', formatProfileDate(profile?.birth_date)],
                ['Anniversary', formatProfileDate(profile?.anniversary)],
              ]}
            />
          </Card>

          <Card title="Ticket">
            <InfoGrid
              columns="sm:grid-cols-2 lg:grid-cols-1"
              items={[
                ['Store', `${ticket.store_code} — ${ticket.store_name}`],
                ['Sales person', ticket.sales_person_name],
                ['Created', `${formatDateTime(ticket.created_at)} by ${ticket.created_by}`],
                ['Order no.', ticket.pos_order?.document_no ?? '—'],
              ]}
            />
          </Card>

          <Card title="History">
            <ol className="flex flex-col gap-3 border-l border-border pl-4">
              {history.map((entry, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden="true" />
                  <p className="font-medium">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                    {entry.changes?.version ? ` · ${versionText(entry.changes.version)}` : ''}
                    {entry.changes?.round ? ` · Round ${entry.changes.round}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(entry.at)} · {entry.user}{entry.store_code ? ` (${entry.store_code})` : ''}
                  </p>
                  {entry.changes?.document_no && (
                    <p className="text-xs text-muted-foreground">
                      Order {entry.changes.document_no}
                      {entry.changes.net_amount ? ` · ${formatAmountOrDash(entry.changes.net_amount)}` : ''}
                    </p>
                  )}
                  {entry.changes?.order_amount && (
                    <p className="text-xs text-muted-foreground">
                      Order {formatAmountOrDash(entry.changes.order_amount)}
                      {entry.changes.amount_received ? ` · advance ${formatAmountOrDash(entry.changes.amount_received)}` : ''}
                      {entry.changes.advance_receipt_no ? ` (receipt ${entry.changes.advance_receipt_no})` : ''}
                    </p>
                  )}
                  {entry.note && <p className="text-xs text-muted-foreground whitespace-pre-line">“{entry.note}”</p>}
                  {entry.changes?.feedback && <p className="text-xs text-muted-foreground whitespace-pre-line">“{entry.changes.feedback}”</p>}
                  {entry.changes?.reason && <p className="text-xs text-muted-foreground whitespace-pre-line">“{entry.changes.reason}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {canDecideG2d && dialog === 'approve_g2d' && (
        <ConfirmOrderDialog
          ticket={ticket}
          isOpen
          onOpenChange={(open) => setDialog(open ? 'approve_g2d' : null)}
          isPending={action.isPending}
          advanceReceiptId={advanceReceiptId}
          onReceiptCreated={setAdvanceReceiptId}
          onSave={(order) => run(
            { action: 'approve_g2d', round: latestG2d.round, order },
            'Order confirmed and sent to CAD.',
          )}
        />
      )}
      {canDecideG2d && (
        <ReasonDialog
          isOpen={dialog === 'reject_g2d'}
          onOpenChange={(open) => setDialog(open ? 'reject_g2d' : null)}
          title={`Request changes to G2D round ${latestG2d.round}`}
          description="The customer's changes go to the CAD team for a revised G2D estimate."
          label="Changes the customer wants"
          confirmLabel="Send to CAD"
          isPending={action.isPending}
          onConfirm={(feedback) => run({ action: 'reject_g2d', round: latestG2d.round, feedback }, 'Changes sent to the CAD team.')}
        />
      )}
      {canDecideDesign && (
        <ConfirmDialog
          isOpen={dialog === 'approve'}
          onOpenChange={(open) => setDialog(open ? 'approve' : null)}
          title={`Approve design ${latest.label}?`}
          description="Confirm the customer has approved this exact version. The workflow team will send the final details and SKU."
          confirmLabel="Approve"
          confirmVariant="default"
          onConfirm={() => run({ action: 'approve_design', version: latest.version }, `Design ${latest.label} approved.`)}
        />
      )}
      {canDecideDesign && (
        <ReasonDialog
          isOpen={dialog === 'reject'}
          onOpenChange={(open) => setDialog(open ? 'reject' : null)}
          title={`Request changes to ${latest.label}`}
          description="The customer's feedback goes to the CAD team for the next version."
          label="Customer feedback"
          confirmLabel="Send to CAD"
          isPending={action.isPending}
          onConfirm={(feedback) => run({ action: 'reject_design', version: latest.version, feedback }, 'Feedback sent to the CAD team.')}
        />
      )}
      <ReasonDialog
        isOpen={dialog === 'cancel'}
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        title="Cancel this ticket?"
        description="Record why the customer is cancelling. The CAD and workflow teams will see the reason."
        label="Cancellation reason"
        confirmLabel="Cancel ticket"
        confirmVariant="destructive"
        isPending={action.isPending}
        onConfirm={(reason) => run({ action: 'cancel', reason }, 'Ticket cancelled.')}
      />
      {dialog === 'edit' && (
        <EditRequestDialog
          ticket={ticket}
          isOpen
          onOpenChange={(open) => setDialog(open ? 'edit' : null)}
          isPending={action.isPending}
          onSave={(payload) => run({ action: 'update_request', ...payload }, 'Request updated.')}
        />
      )}
    </div>
  );
}
