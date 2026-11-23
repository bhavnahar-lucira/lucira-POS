'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CheckCircle2, ClipboardCheck, MessageSquareWarning, Pencil, Plus, ShoppingCart, XCircle } from 'lucide-react';

import TicketFileThumb from '@/components/features/ticketing/TicketFileThumb';
import TicketComments from '@/components/features/ticketing/TicketComments';
import {
  HoldButton, ResponseStatusBar, ResponseTimesCard, ResponseHistoryDetail,
} from '@/components/features/ticketing/ResponseTimer';
import TicketRequestFields, { EMPTY_SPECS, NameSelect } from '@/components/features/ticketing/TicketRequestFields';
import { productProblem } from '@/components/features/ticketing/TicketMultiForm';
import { OrderLineReview, useOrderLookups, useTicketCartHandoff } from '@/components/features/ticketing/TicketOrderPanel';
import {
  TicketStatusBadge, Card, InfoGrid, TextBlock, ReasonDialog, DecisionTag, FormField, FormSection, FinalDetails,
  ReopenFinalDialog, PreviousFinalDetails, EditRequestDialog, ACTION_LABELS, SPEC_LABELS,
  formatDateTime, formatProfileDate, formatSpec, designFiles, versionText, todayIso,
} from '@/components/features/ticketing/TicketDetail';
import AdvanceReceiptLink from '@/components/features/ticketing/AdvanceReceiptLink';
import InvoiceReportButton from '@/components/features/checkout/InvoiceReportButton';
import CheckoutPaymentSection from '@/components/features/checkout/CheckoutPaymentSection';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import InlineLoader from '@/components/shared/InlineLoader';
import PhoneLink from '@/components/shared/PhoneLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTicketAction } from '@/hooks/ticketing/useTickets';
import { useMetalRates } from '@/hooks/settings/useMetalRates';
import { useAttributeOptions, useKaratOptions } from '@/hooks/catalog/useCatalogFilterOptions';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { createAdvanceReceipt, listUnusedAdvanceReceipts, findReusedPaymentRefs } from '@/services/advanceReceiptService';
import { createEstimationTempVoucher } from '@/services/customEstimateService';
import { buildOrderFromFinal } from '@/lib/ticketing/orderFromFinal';
import { validatePayments, toStoredPayment } from '@/lib/checkout/paymentModeRules';
import { resolveDocumentDateTime } from '@/lib/dateUtils';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import APP_CONFIG from '@/constants/appConfig';
import { TICKET_STATUS, TICKET_ITEM_MAX_FILES, TICKET_MAX_ITEMS, goldKarat } from '@/lib/ticketing/constants';

const MULTI_ACTION_LABELS = {
  ...ACTION_LABELS,
  ticket_created: 'Ticket created',
  item_added: 'Product added',
  g2d_approved: 'Customer approved G2D',
  order_confirmed: 'Order confirmed',
  item_cancelled: 'Product cancelled',
};

const ITEM_STEPS = ['Request', 'G2D estimate', 'G2D approval', 'Order & advance', 'CAD design', 'CAD approval', 'Final details', 'Order'];
const STEP_BY_STATUS = {
  awaiting_g2d: 1,
  g2d_shared: 2,
  g2d_approved: 3,
  awaiting_cad: 4,
  awaiting_customer_feedback: 5,
  awaiting_final: 6,
  final_received: 7,
  order_placed: 8,
};

const isActive = (item) => item.status !== TICKET_STATUS.CANCELLED;
const productName = (item) => `${item.item_id} · ${item.requested_specs?.category ?? 'Product'}`;

function ItemProgress({ status }) {
  const current = STEP_BY_STATUS[status] ?? 0;
  return (
    <ol className="flex items-center gap-1" aria-label="Product progress">
      {ITEM_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1" title={label}>
            <span className={`h-1.5 w-full rounded-full ${done ? 'bg-primary' : active ? 'bg-primary/40' : 'bg-border'}`} />
            <span className={`hidden text-[10px] leading-tight sm:block ${active ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SubSection({ title, children }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
      {children}
    </div>
  );
}

function ProductCard({ ticket, item, partyId, run, isPending, canChange }) {
  const [dialog, setDialog] = useState(null);
  const { status } = item;
  const requested = item.requested_specs ?? {};
  const g2d = item.g2d_estimates ?? [];
  const designs = item.designs ?? [];
  const latestG2d = g2d[0];
  const latest = designs[0];
  const cancelled = status === TICKET_STATUS.CANCELLED;
  const canDecideG2d = status === TICKET_STATUS.G2D_SHARED && latestG2d && !latestG2d.customer_decision;
  const canDecideDesign = status === TICKET_STATUS.AWAITING_CUSTOMER_FEEDBACK && latest && !latest.customer_decision;
  const commentCount = (ticket.comments ?? []).filter((c) => c.item_id === item.item_id).length;
  const close = () => setDialog(null);
  const act = (payload, message) => run({ ...payload, item_id: item.item_id }, message, close);

  const decisionButtons = (onReject, onApprove, approveLabel) => (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={onReject}>
        <MessageSquareWarning size={16} aria-hidden="true" /> Request changes
      </Button>
      <Button type="button" className="h-10 gap-1.5" onClick={onApprove}>
        <CheckCircle2 size={16} aria-hidden="true" /> {approveLabel}
      </Button>
    </div>
  );

  return (
    <section
      id={item.item_id}
      className={`flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5 ${cancelled ? 'border-dashed border-border opacity-75' : 'border-border'} ${canDecideG2d || canDecideDesign ? 'ring-2 ring-primary/40' : ''}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{item.item_id}</h2>
            <span className="text-sm text-muted-foreground">{requested.category ?? '—'}</span>
            <TicketStatusBadge
              status={status}
              label={status === TICKET_STATUS.FINAL_RECEIVED && ticket.status !== TICKET_STATUS.FINAL_RECEIVED
                ? 'Final details received – waiting for the other products' : undefined}
            />
          </div>
          {requested.budget != null && requested.budget !== '' && (
            <span className="text-xs text-muted-foreground">Budget {formatAmountOrDash(requested.budget)}</span>
          )}
        </div>
        {canChange && !cancelled && (
          <div className="flex flex-wrap gap-2">
            {status === TICKET_STATUS.AWAITING_G2D && (
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setDialog('edit')}>
                <Pencil size={14} aria-hidden="true" /> Update request
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-destructive" onClick={() => setDialog('cancel')}>
              <XCircle size={14} aria-hidden="true" /> Cancel product
            </Button>
          </div>
        )}
      </div>

      {cancelled ? (
        <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
          Cancelled {formatDateTime(item.cancelled_at ?? ticket.cancelled_at)}{(item.cancelled_by ?? ticket.cancelled_by) ? ` by ${item.cancelled_by ?? ticket.cancelled_by}` : ''}
          {(item.cancel_reason ?? ticket.cancel_reason) && <><br />Reason: {item.cancel_reason ?? ticket.cancel_reason}</>}
        </p>
      ) : (
        <ItemProgress status={status} />
      )}

      <InfoGrid items={SPEC_LABELS.map(([key, label]) => [label, formatSpec(key, requested[key])])} />
      {requested.requirement_notes && <TextBlock label="Requirement">{requested.requirement_notes}</TextBlock>}
      {requested.description && <TextBlock label="Description / discount & offer">{requested.description}</TextBlock>}
      {item.reference_images?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.reference_images.map((file) => <TicketFileThumb key={file.id ?? file.url} file={file} />)}
        </div>
      )}

      {(g2d.length > 0 || !cancelled) && (
        <SubSection title="G2D estimate">
          {g2d.length === 0 ? (
            <p className="text-sm text-muted-foreground">The CAD team hasn&apos;t shared the G2D estimate yet.</p>
          ) : [...g2d].reverse().map((estimate) => (
            <div key={estimate.round} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">Round {estimate.round}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(estimate.at)} by {estimate.by}</span>
                <DecisionTag decision={estimate.customer_decision} />
              </div>
              {estimate.changes.length > 0 && (
                <InfoGrid items={estimate.changes.map((c) => [c.field, `${c.to ?? '—'}${c.from && c.from !== c.to ? ` (requested ${c.from})` : ''}`])} />
              )}
              {estimate.note && <TextBlock label="CAD remarks">{estimate.note}</TextBlock>}
              {estimate.files.length > 0 && (
                <div className="flex flex-wrap gap-2">{designFiles(estimate).map((file) => <TicketFileThumb key={file.url} file={file} />)}</div>
              )}
              {estimate.customer_feedback && (
                <p className="rounded-lg bg-muted/50 p-2 text-sm whitespace-pre-line">
                  <span className="text-xs text-muted-foreground">Changes requested: </span>{estimate.customer_feedback}
                </p>
              )}
            </div>
          ))}
          {canDecideG2d && (
            <>
              <p className="rounded-lg bg-primary/5 p-3 text-sm">Show G2D round {latestG2d.round} to the customer and record their decision.</p>
              {decisionButtons(() => setDialog('reject_g2d'), () => setDialog('approve_g2d'), 'Customer approved G2D')}
            </>
          )}
          {status === TICKET_STATUS.G2D_APPROVED && (
            <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
              Approved by the customer. CAD starts once the order is confirmed for every product (button at the top).
            </p>
          )}
          {item.order_details && (
            <InfoGrid
              items={[
                ['Order amount', formatAmountOrDash(item.order_details.order_amount)],
                ['Expected delivery', formatProfileDate(item.order_details.expected_delivery_date)],
                ['Metal', [item.order_details.karat, item.order_details.metal].filter(Boolean).join(' ') || '—'],
                ['Size', item.order_details.size ?? '—'],
                ['Gold rate (₹/g)', formatAmountOrDash(item.order_details.gold_rate)],
                ['Confirmed', `${formatDateTime(item.order_details.confirmed_at)} by ${item.order_details.confirmed_by}`],
              ]}
            />
          )}
        </SubSection>
      )}

      {(designs.length > 0 || item.order_details) && (
        <SubSection title="CAD design">
          {item.cad_remarks && <TextBlock label="CAD remarks">{item.cad_remarks}</TextBlock>}
          {designs.length === 0 ? (
            <p className="text-sm text-muted-foreground">The CAD team is working on the design.</p>
          ) : [...designs].reverse().map((design) => (
            <div key={design.version} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{design.label}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(design.uploaded_at)}{design.uploaded_by ? ` by ${design.uploaded_by}` : ''}</span>
                <DecisionTag decision={design.customer_decision} />
              </div>
              {design.cad_notes && <p className="text-sm text-muted-foreground whitespace-pre-line">{design.cad_notes}</p>}
              {design.files.length > 0
                ? <div className="flex flex-wrap gap-2">{designFiles(design).map((file) => <TicketFileThumb key={file.url} file={file} />)}</div>
                : <p className="text-xs text-muted-foreground">No design file attached to this version.</p>}
              {design.customer_feedback && (
                <p className="rounded-lg bg-muted/50 p-2 text-sm whitespace-pre-line">
                  <span className="text-xs text-muted-foreground">Customer feedback: </span>{design.customer_feedback}
                </p>
              )}
            </div>
          ))}
          {canDecideDesign && (
            <>
              <p className="rounded-lg bg-primary/5 p-3 text-sm">Show design {latest.label} to the customer and record their decision.</p>
              {decisionButtons(() => setDialog('reject_design'), () => setDialog('approve_design'), `Approve ${latest.label}`)}
            </>
          )}
        </SubSection>
      )}

      {(item.final_details || status === TICKET_STATUS.AWAITING_FINAL || item.final_revisions?.length > 0) && (
        <SubSection title="Final details">
          {item.final_details ? (
            <details className="rounded-lg border border-border p-3 text-sm" open={status === TICKET_STATUS.FINAL_RECEIVED}>
              <summary className="cursor-pointer font-medium text-foreground">
                Net {formatAmountOrDash(item.final_details.netAmount)} · received {formatDateTime(item.final_details.received_at)}
              </summary>
              <div className="mt-3"><FinalDetails details={item.final_details} /></div>
            </details>
          ) : (
            <p className="text-sm text-muted-foreground">Design approved. Waiting for the team to send the final details.</p>
          )}
          {status === TICKET_STATUS.FINAL_RECEIVED && canChange && (
            <Button type="button" variant="outline" className="h-10 self-start" onClick={() => setDialog('reopen_final')}>Request changes</Button>
          )}
          {item.final_revisions?.length > 0 && <PreviousFinalDetails revisions={item.final_revisions} />}
        </SubSection>
      )}

      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Comments on this product ({commentCount})
        </summary>
        <div className="mt-3">
          <TicketComments ticket={ticket} partyId={partyId} itemId={item.item_id} bare />
        </div>
      </details>

      {dialog === 'edit' && (
        <EditRequestDialog
          ticket={item}
          isOpen
          maxFiles={TICKET_ITEM_MAX_FILES}
          onOpenChange={(open) => setDialog(open ? 'edit' : null)}
          isPending={isPending}
          onSave={(payload) => act({ action: 'update_request', ...payload }, `${item.item_id} updated.`)}
        />
      )}
      <ReasonDialog
        isOpen={dialog === 'cancel'}
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        title={`Cancel ${productName(item)}?`}
        description="Only this product is cancelled; the rest of the ticket continues. The CAD team will see the reason."
        label="Cancellation reason"
        confirmLabel="Cancel product"
        confirmVariant="destructive"
        isPending={isPending}
        onConfirm={(reason) => act({ action: 'cancel_item', reason }, `${item.item_id} cancelled.`)}
      />
      {canDecideG2d && (
        <>
          <ConfirmDialog
            isOpen={dialog === 'approve_g2d'}
            onOpenChange={(open) => setDialog(open ? 'approve_g2d' : null)}
            title={`Customer approved G2D round ${latestG2d.round}?`}
            description="The order and advance are confirmed once for the whole ticket, after every product's G2D is approved."
            confirmLabel="Approve"
            confirmVariant="default"
            onConfirm={() => act({ action: 'approve_g2d', round: latestG2d.round }, `G2D approved for ${item.item_id}.`)}
          />
          <ReasonDialog
            isOpen={dialog === 'reject_g2d'}
            onOpenChange={(open) => setDialog(open ? 'reject_g2d' : null)}
            title={`Request changes to G2D round ${latestG2d.round}`}
            description="The customer's changes go to the CAD team for a revised G2D estimate."
            label="Changes the customer wants"
            confirmLabel="Send to CAD"
            isPending={isPending}
            onConfirm={(feedback) => act({ action: 'reject_g2d', round: latestG2d.round, feedback }, 'Changes sent to the CAD team.')}
          />
        </>
      )}
      {canDecideDesign && (
        <>
          <ConfirmDialog
            isOpen={dialog === 'approve_design'}
            onOpenChange={(open) => setDialog(open ? 'approve_design' : null)}
            title={`Approve design ${latest.label}?`}
            description="Confirm the customer has approved this exact version. The workflow team will send the final details and SKU."
            confirmLabel="Approve"
            confirmVariant="default"
            onConfirm={() => act({ action: 'approve_design', version: latest.version }, `Design ${latest.label} approved.`)}
          />
          <ReasonDialog
            isOpen={dialog === 'reject_design'}
            onOpenChange={(open) => setDialog(open ? 'reject_design' : null)}
            title={`Request changes to ${latest.label}`}
            description="The customer's feedback goes to the CAD team for the next version."
            label="Customer feedback"
            confirmLabel="Send to CAD"
            isPending={isPending}
            onConfirm={(feedback) => act({ action: 'reject_design', version: latest.version, feedback }, 'Feedback sent to the CAD team.')}
          />
        </>
      )}
      {dialog === 'reopen_final' && (
        <ReopenFinalDialog
          isOpen
          onOpenChange={(open) => setDialog(open ? 'reopen_final' : null)}
          isPending={isPending}
          onConfirm={({ target, reason }) => act(
            { action: 'reopen_final', target, reason },
            target === 'cad' ? 'Design changes sent to the CAD team.' : 'Revised final details requested.',
          )}
        />
      )}
    </section>
  );
}

function ConfirmTicketOrderDialog({ ticket, pendingItems, isOpen, onOpenChange, isPending, onSave, advanceReceipt, onReceiptCreated }) {
  const isFirstConfirmation = !ticket.order_details;
  const [orderDate, setOrderDate] = useState(ticket.order_details?.order_date ?? todayIso());
  const [lines, setLines] = useState(() => pendingItems.map((item) => {
    const s = item.requested_specs ?? {};
    return {
      item_id: item.item_id,
      round: item.g2d_estimates?.[0]?.round,
      karat: item.specs?.karat ?? s.karat ?? '',
      metal: item.specs?.metal ?? s.metal ?? '',
      size: item.specs?.size ?? s.size ?? '',
      order_amount: '',
      expected_delivery_date: '',
      description: item.specs?.description ?? s.description ?? '',
    };
  }));
  const [remarks, setRemarks] = useState('');
  const [amountReceived, setAmountReceived] = useState(advanceReceipt?.amount ?? '');
  const [advanceOn, setAdvanceOn] = useState(advanceReceipt?.date ?? todayIso());
  const [advancePayments, setAdvancePayments] = useState(() => advanceReceipt?.payments ?? []);
  const [isCreatingReceipt, setIsCreatingReceipt] = useState(false);
  const setLine = (n, key) => (e) => setLines((all) => all.map((l, i) => (i === n ? { ...l, [key]: e?.target ? e.target.value : e } : l)));

  const { options: metalOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.METAL_COLOR);
  const { options: karatOptions } = useKaratOptions();
  const rateCodes = [...new Set(lines.map((l) => goldKarat(l.karat)?.rateCode).filter(Boolean))];
  const { rates } = useMetalRates(rateCodes);
  const rateFor = (karat) => rates.find((r) => r.code === goldKarat(karat)?.rateCode)?.rate ?? null;

  const storeId = useSelector(selectActiveStoreId);
  const receiptHeader = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.POS_RECEIPT);
  const advanceReceiptId = advanceReceipt?.id ?? null;
  const receiptLocked = !!advanceReceiptId;
  const hasAdvance = Number(amountReceived) > 0;
  const newTotal = lines.reduce((t, l) => t + (Number(l.order_amount) || 0), 0);
  const previousAdvance = (ticket.advances ?? []).reduce((t, a) => t + (a.amount || 0), 0);

  const missing = [
    !orderDate && 'order date',
    ...lines.flatMap((l) => [
      !(Number(l.order_amount) > 0) && `${l.item_id} order amount`,
      !l.expected_delivery_date && `${l.item_id} delivery date`,
      !l.karat && `${l.item_id} karat`,
      l.karat && !rateFor(l.karat) && `today's gold rate for ${l.karat}`,
    ]),
    hasAdvance && !advanceOn && 'advance received date',
  ].filter(Boolean);
  const paymentError = hasAdvance && !receiptLocked
    ? validatePayments(advancePayments, { amountDue: Number(amountReceived), label: 'the amount received' })
    : null;

  const existingAdvances = useQuery({
    queryKey: ['ticket-unused-advances', ticket.customer_party_id],
    queryFn: () => listUnusedAdvanceReceipts(ticket.customer_party_id),
    enabled: isOpen && !receiptLocked && !!ticket.customer_party_id,
    staleTime: 0,
    gcTime: 0,
  });
  const attachedIds = new Set((ticket.advances ?? []).map((a) => a.transaction_id));
  const unusedAdvances = (existingAdvances.data ?? []).filter((r) => !attachedIds.has(r.id));
  const linkExistingReceipt = (r) => {
    const payments = r.details.map(toStoredPayment);
    const date = String(r.documentDate ?? '').slice(0, 10) || todayIso();
    setAmountReceived(r.amount);
    setAdvanceOn(date);
    setAdvancePayments(payments);
    onReceiptCreated({ id: r.id, amount: r.amount, date, payments, documentNo: r.documentNo });
    toast.success(`${r.documentNo} linked as this ticket's advance.`);
  };

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
        const reused = await findReusedPaymentRefs(ticket.customer_party_id, advancePayments);
        if (reused.length) {
          const [first] = reused;
          toast.error(`Reference ${first.refNo} is already on advance receipt ${first.documentNo} for this customer — link that receipt instead of booking the payment twice.`);
          return;
        }
        const res = await createAdvanceReceipt({
          partyId: ticket.customer_party_id,
          activeStoreId: storeId,
          financialYearId: receiptHeader.financialYearId,
          ledgerId: receiptHeader.ledgerId,
          numberOfBackdatedDays: receiptHeader.numberOfBackdatedDays,
          documentDate: resolveDocumentDateTime(advanceOn).toISOString(),
          narration: `Advance for custom order ticket ${ticket.ticket_number}`,
          payments: advancePayments,
        });
        receiptId = res?.EntityId;
        if (!receiptId) throw new Error('OrnaVerse did not return the advance receipt.');
        onReceiptCreated({ id: receiptId, amount: amountReceived, date: advanceOn, payments: advancePayments.map(toStoredPayment) });
        toast.success('Advance receipt created in OrnaVerse.');
      } catch (err) {
        toast.error(err?.response?.data?.Error?.Message ?? err?.message ?? 'The advance receipt could not be created.');
        return;
      } finally {
        setIsCreatingReceipt(false);
      }
    }
    onSave({
      order_date: orderDate,
      items: lines,
      amount_received: hasAdvance ? Number(amountReceived) : null,
      advance_received_on: hasAdvance ? advanceOn : null,
      advance_receipt_id: hasAdvance ? receiptId : null,
      payments: hasAdvance ? advancePayments.map(toStoredPayment) : [],
      remarks: remarks.trim() || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isFirstConfirmation ? 'Confirm order & collect advance' : 'Confirm order for added products'}</DialogTitle>
          <DialogDescription>{ticket.ticket_number} · {ticket.customer_name} · {pendingItems.length} product{pendingItems.length > 1 ? 's' : ''}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-foreground">These products move to <strong>CAD design in progress</strong>. Product and commercial details are locked after this.</p>

        <FormSection title="Order">
          <FormField label="Order date" htmlFor="mco-date" required>
            <Input id="mco-date" className="h-11" type="date" max={todayIso()} disabled={!isFirstConfirmation} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </FormField>
          <FormField label="Remarks" htmlFor="mco-remarks">
            <Input id="mco-remarks" className="h-11" maxLength={1000} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </FormField>
        </FormSection>

        {lines.map((l, n) => {
          const rate = rateFor(l.karat);
          return (
            <FormSection key={l.item_id} title={productName(pendingItems[n])}>
              <FormField label="Order amount (₹)" htmlFor={`mco-amount-${n}`} required>
                <Input id={`mco-amount-${n}`} className="h-11" type="number" min="0" inputMode="decimal" value={l.order_amount} onChange={setLine(n, 'order_amount')} />
              </FormField>
              <FormField label="Expected delivery date" htmlFor={`mco-delivery-${n}`} required>
                <Input id={`mco-delivery-${n}`} className="h-11" type="date" min={todayIso()} value={l.expected_delivery_date} onChange={setLine(n, 'expected_delivery_date')} />
              </FormField>
              <FormField label="Karat" htmlFor={`mco-karat-${n}`} required>
                <NameSelect id={`mco-karat-${n}`} value={l.karat} onChange={setLine(n, 'karat')} options={karatOptions.map((o) => o.label)} placeholder="Select karat" />
              </FormField>
              <FormField label={`Gold rate (₹/g)${l.karat ? ` · today, ${l.karat}` : ''}`} htmlFor={`mco-rate-${n}`}>
                <Input id={`mco-rate-${n}`} className="h-11 bg-muted/50" readOnly aria-readonly="true" value={rate ? formatAmountOrDash(rate) : l.karat ? 'Fetching / not available' : '—'} />
              </FormField>
              <FormField label="Metal" htmlFor={`mco-metal-${n}`}>
                <NameSelect id={`mco-metal-${n}`} value={l.metal} onChange={setLine(n, 'metal')} options={metalOptions.map((o) => o.label)} placeholder="Select color" />
              </FormField>
              <FormField label="Size" htmlFor={`mco-size-${n}`}>
                <Input id={`mco-size-${n}`} className="h-11" maxLength={100} value={l.size} onChange={setLine(n, 'size')} />
              </FormField>
              <FormField label="Description / discount & offer" htmlFor={`mco-desc-${n}`} className="sm:col-span-2">
                <Textarea id={`mco-desc-${n}`} rows={2} maxLength={2000} value={l.description} onChange={setLine(n, 'description')} />
              </FormField>
            </FormSection>
          );
        })}

        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Order amount (these products)</span><span className="tabular-nums">{formatAmountOrDash(newTotal)}</span></div>
          {!isFirstConfirmation && (
            <div className="flex justify-between"><span className="text-muted-foreground">Already confirmed on the ticket</span><span className="tabular-nums">{formatAmountOrDash(ticket.order_details.order_amount)}</span></div>
          )}
          {previousAdvance > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Advance already received</span><span className="tabular-nums">{formatAmountOrDash(previousAdvance)}</span></div>
          )}
        </div>

        <FormSection title={isFirstConfirmation ? 'Advance payment (whole ticket)' : 'Additional advance (optional)'}>
          {receiptLocked && (
            <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground sm:col-span-2">
              {advanceReceipt?.documentNo ? `Advance receipt ${advanceReceipt.documentNo}` : 'The advance receipt'} is linked in OrnaVerse — Submit attaches it to this ticket.
            </p>
          )}
          {!receiptLocked && unusedAdvances.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-medium">{ticket.customer_name} already has unused advance receipts. If the advance was already taken, link it here instead of booking it again:</p>
              {unusedAdvances.map((r) => (
                <div key={r.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <span><strong>{r.documentNo}</strong> · {formatAmountOrDash(r.amount)} · {formatProfileDate(r.documentDate)}</span>
                  <Button type="button" size="sm" variant="outline" className="h-9 bg-background" onClick={() => linkExistingReceipt(r)}>Use this receipt</Button>
                </div>
              ))}
            </div>
          )}
          <FormField label="Amount received (₹)" htmlFor="mco-received">
            <Input id="mco-received" className="h-11" type="number" min="0" inputMode="decimal" disabled={receiptLocked} value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} />
          </FormField>
          <FormField label="Advance received date" htmlFor="mco-adv-date" required={hasAdvance}>
            <Input id="mco-adv-date" className="h-11" type="date" max={todayIso()} disabled={receiptLocked} value={advanceOn} onChange={(e) => setAdvanceOn(e.target.value)} />
          </FormField>
          {!receiptLocked && (
            <div className="sm:col-span-2 pt-1">
              <Label className="text-sm font-medium mb-1.5 block">Payment Mode {hasAdvance && <span className="text-destructive">*</span>}</Label>
              <CheckoutPaymentSection
                bare={true}
                hideHelpers={true}
                allowPartial={false}
                amountDue={Number(amountReceived) || 0}
                onChange={setAdvancePayments}
                partyId={ticket.customer_party_id}
                storeId={storeId}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            One advance receipt covers the whole ticket; at checkout use “Advance Paid” to adjust it against the order.
          </p>
        </FormSection>

        {missing.length > 0 && <p className="text-xs text-muted-foreground">To submit, fill in: {missing.join(', ')}.</p>}
        {paymentError && hasAdvance && <p className="text-xs text-muted-foreground">Advance payment: {paymentError}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="h-11" disabled={isPending || isCreatingReceipt || missing.length > 0 || !!paymentError} onClick={handleSubmit}>
            {isCreatingReceipt ? 'Creating advance receipt…' : isPending ? 'Submitting…' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddProductDialog({ isOpen, onOpenChange, isPending, onSave }) {
  const [specs, setSpecs] = useState(EMPTY_SPECS);
  const [files, setFiles] = useState([]);
  const save = () => {
    const problem = productProblem(specs, files);
    if (problem) return toast.error(problem);
    onSave({ specs, file_ids: files.map((f) => f.id) });
  };
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
          <DialogDescription>The new product goes to the CAD team for its own G2D estimate.</DialogDescription>
        </DialogHeader>
        <TicketRequestFields idPrefix="add-product" specs={specs} onSpecsChange={setSpecs} files={files} onFilesChange={setFiles} maxFiles={TICKET_ITEM_MAX_FILES} requireFiles />
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="h-11" disabled={isPending} onClick={save}>{isPending ? 'Adding…' : 'Add product'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One order for every active product, built from each product's final details. */
function MultiOrderPanel({ ticket, partyId }) {
  const action = useTicketAction(ticket.ticket_number, { partyId });
  const [note, setNote] = useState('');
  const [overrides, setOverrides] = useState({});
  const { ready, lookups } = useOrderLookups();
  const { sendToCart, isAttaching } = useTicketCartHandoff(ticket);
  const products = ticket.items.filter(isActive);

  const query = useQuery({
    queryKey: ['ticket-order', ticket.ticket_number, ticket.updated_at, overrides],
    queryFn: async () => {
      const results = [];
      for (const item of products) {
        const view = { ...item, specs: item.specs, order_details: item.order_details };
        results.push({ item, result: await buildOrderFromFinal(item.final_details, view, lookups, overrides[item.item_id] ?? {}) });
      }
      return results;
    },
    enabled: ready && products.every((p) => p.final_details),
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!ready || query.isLoading) return <InlineLoader label="Building the order from the workflow team's final details…" />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <p>{query.error?.message ?? 'The order could not be built.'}</p>
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  const results = query.data ?? [];
  const isRebuilding = query.isFetching && query.isPlaceholderData;
  const allChecks = results.flatMap(({ item, result }) => (result.checks ?? []).filter((c) => !c.ok).map((c) => ({ ...c, label: `${item.item_id}: ${c.label}` })));
  const allReview = results.flatMap(({ item, result }) => (result.review ?? []).map((r) => `${item.item_id}: ${r}`));
  const hasNotes = allChecks.length > 0 || allReview.length > 0;
  const blocked = results.some(({ result }) => !result.line || result.blockers?.length || (result.unresolved ?? []).some((u) => u.chosen == null));
  const canProceed = results.length === products.length && !blocked && !isRebuilding;
  const netTotal = results.reduce((t, { result }) => t + (result.summary?.netAmount ?? 0), 0);

  const handleCheckout = async () => {
    if (hasNotes) {
      await action.mutateAsync({
        action: 'acknowledge_pricing',
        mismatches: [
          ...allChecks.map((c) => ({ label: c.label.slice(0, 300), workflow: c.workflow ?? null, reference: c.reference ?? null })),
          ...allReview.map((r) => ({ label: r.slice(0, 300), workflow: null, reference: null })),
        ].slice(0, 60),
        note: note.trim() || null,
      }).catch(() => toast.warning('The acknowledgement could not be saved to the ticket history — the order still proceeds.'));
    }
    await sendToCart(results.map(({ result }) => ({ item: result.item, line: result.line, summary: result.summary })));
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Place the order · {products.length} product{products.length > 1 ? 's' : ''}</span>
        <p className="text-sm">Every product has its final details. The order uses the workflow team&apos;s figures exactly · net total <strong>{formatAmountOrDash(netTotal)}</strong>.</p>
      </div>
      {results.map(({ item, result }) => (
        <details key={item.item_id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3" open={!result.line || result.blockers?.length > 0}>
          <summary className="cursor-pointer text-sm font-medium">
            {productName(item)}{result.summary ? ` · ${result.summary.itemName} · net ${formatAmountOrDash(result.summary.netAmount)}` : ' · cannot be built'}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <OrderLineReview
              result={result}
              overrides={overrides[item.item_id] ?? {}}
              onChoose={(key, value) => setOverrides((prev) => ({ ...prev, [item.item_id]: { ...(prev[item.item_id] ?? {}), [key]: Number(value) } }))}
            />
            {result.line && (
              <div className="w-full sm:w-48">
                <InvoiceReportButton
                  resolveTransactionId={() => createEstimationTempVoucher(result.line)}
                  optKey="transaction_item_id"
                  documentId={APP_CONFIG.DOCUMENT_TYPES.ESTIMATION}
                  documentLabel="Estimate"
                />
              </div>
            )}
          </div>
        </details>
      ))}
      {hasNotes && !blocked && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-background p-3 dark:border-amber-800">
          <Label htmlFor="multi-ack-note" className="text-xs text-muted-foreground">Note (optional, saved in the ticket history with the differences above)</Label>
          <Textarea id="multi-ack-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      <Button type="button" className="h-11 gap-1.5 sm:self-end" disabled={!canProceed || action.isPending || isAttaching} onClick={handleCheckout}>
        <ShoppingCart size={16} aria-hidden="true" /> {isAttaching ? 'Logging in customer…' : action.isPending ? 'Saving…' : 'Proceed to checkout'}
      </Button>
    </div>
  );
}

/** Ticket with several products: one card per product, one advance and one order for the ticket. */
export default function TicketMultiDetail({ ticket, partyId }) {
  const action = useTicketAction(ticket.ticket_number, { partyId });
  const [dialog, setDialog] = useState(null);
  const [advanceReceipt, setAdvanceReceipt] = useState(null);

  const run = (payload, successMessage, onDone) => action.mutate(payload, {
    onSuccess: () => {
      toast.success(successMessage);
      setDialog(null);
      onDone?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const { status, items = [] } = ticket;
  const active = items.filter(isActive);
  const isCancelled = status === TICKET_STATUS.CANCELLED;
  const isOrdered = status === TICKET_STATUS.ORDER_PLACED;
  const canChange = !isCancelled && !isOrdered;
  const pendingConfirmation = active.filter((i) => i.status === TICKET_STATUS.G2D_APPROVED);
  const waitingG2d = active.filter((i) => [TICKET_STATUS.AWAITING_G2D, TICKET_STATUS.G2D_SHARED].includes(i.status) && !i.order_details);
  const notFinal = active.filter((i) => i.status !== TICKET_STATUS.FINAL_RECEIVED);
  const history = [...(ticket.history ?? [])].reverse();
  const profile = ticket.customer_profile;
  const orderDetails = ticket.order_details;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">{ticket.ticket_number}</h1>
            <TicketStatusBadge status={status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {ticket.customer_name} · {active.length} product{active.length === 1 ? '' : 's'}
            {ticket.budget_total ? ` · total budget ${formatAmountOrDash(ticket.budget_total)}` : ''} · Raised {formatDateTime(ticket.created_at)}
          </p>
        </div>
        {canChange && (
          <div className="flex flex-wrap gap-2">
            <HoldButton ticket={ticket} run={run} isPending={action.isPending} />
            {active.length < TICKET_MAX_ITEMS && (
              <Button type="button" className="h-11 gap-1.5" onClick={() => setDialog('add')}>
                <Plus size={16} aria-hidden="true" /> Add product
              </Button>
            )}
            <Button type="button" className="h-11 gap-1.5 bg-red-600 text-white hover:bg-red-700 hover:text-white" onClick={() => setDialog('cancel')}>
              <XCircle size={16} aria-hidden="true" /> Cancel ticket
            </Button>
          </div>
        )}
      </div>

      {canChange && <ResponseStatusBar ticket={ticket} />}

      {isCancelled && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm flex flex-col gap-1">
          <p className="font-medium text-destructive">Cancelled {formatDateTime(ticket.cancelled_at)}{ticket.cancelled_by ? ` by ${ticket.cancelled_by}` : ''}</p>
          {ticket.cancel_reason && <p className="text-foreground whitespace-pre-line">Reason: {ticket.cancel_reason}</p>}
        </div>
      )}

      {canChange && pendingConfirmation.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-violet-300 bg-violet-50 p-4 text-sm text-violet-900 sm:flex-row sm:items-center sm:justify-between dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
          <p>
            {waitingG2d.length
              ? <>G2D approved for {pendingConfirmation.map((i) => i.item_id).join(', ')}. The order can be confirmed once {waitingG2d.map((i) => i.item_id).join(', ')} {waitingG2d.length > 1 ? 'are' : 'is'} approved or cancelled.</>
              : <>All products are approved. Confirm the order and collect the advance to send {pendingConfirmation.length > 1 ? 'them' : 'it'} to CAD.</>}
          </p>
          {!waitingG2d.length && (
            <Button type="button" className="h-11 shrink-0 gap-1.5" onClick={() => setDialog('confirm')}>
              <ClipboardCheck size={16} aria-hidden="true" /> {orderDetails ? 'Confirm added products' : 'Confirm order & advance'}
            </Button>
          )}
        </div>
      )}

      {status === TICKET_STATUS.FINAL_RECEIVED && <MultiOrderPanel key={`${ticket.ticket_number}|${ticket.updated_at ?? ''}`} ticket={ticket} partyId={partyId} />}
      {canChange && status !== TICKET_STATUS.FINAL_RECEIVED && active.some((i) => i.status === TICKET_STATUS.FINAL_RECEIVED) && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          The order is placed once for the whole ticket. Still waiting on: {notFinal.map((i) => `${i.item_id} (${i.requested_specs?.category ?? 'product'})`).join(', ')}.
        </p>
      )}
      {isOrdered && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          <Check size={16} aria-hidden="true" /> Order {ticket.pos_order.document_no} placed {formatDateTime(ticket.pos_order.placed_at)} · {formatAmountOrDash(ticket.pos_order.net_amount)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {ticket.general_notes && <TextBlock label="Notes for the whole ticket">{ticket.general_notes}</TextBlock>}
          {items.map((item) => (
            <ProductCard key={item.item_id} ticket={ticket} item={item} partyId={partyId} run={run} isPending={action.isPending} canChange={canChange} />
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Customer">
            <InfoGrid
              columns="sm:grid-cols-2 lg:grid-cols-1"
              items={[
                ['Name', ticket.customer_name],
                ['Customer code', profile?.party_code ?? '—'],
                ['Mobile', ticket.customer_mobile ? <PhoneLink phone={ticket.customer_mobile} /> : '—'],
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
                ['Jewelry Consultant', ticket.sales_person_name],
                ['Created', `${formatDateTime(ticket.created_at)} by ${ticket.created_by}`],
                ['Products', active.map((i) => `${i.item_id} · ${i.requested_specs?.category ?? '—'}${i.requested_specs?.budget ? ` · ${formatAmountOrDash(i.requested_specs.budget)}` : ''}`).join('\n') || '—'],
                ['Total budget', formatAmountOrDash(ticket.budget_total)],
                ['Order amount', formatAmountOrDash(orderDetails?.order_amount)],
                ['Advance received', formatAmountOrDash(orderDetails?.amount_received)],
                ['Order no.', ticket.pos_order?.document_no ?? '—'],
              ]}
            />
            {(ticket.advances ?? []).map((a) => (
              <div key={a.transaction_id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <AdvanceReceiptLink receipt={a} customerName={ticket.customer_name} /> · {formatAmountOrDash(a.amount)} · {formatProfileDate(a.received_on)}
              </div>
            ))}
          </Card>

          <TicketComments ticket={ticket} partyId={partyId} items={items} />

          <ResponseTimesCard ticket={ticket} Card={Card} />

          <Card title="History">
            <ol className="flex flex-col gap-3 border-l border-border pl-4">
              {history.map((entry, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden="true" />
                  <p className="font-medium">
                    {MULTI_ACTION_LABELS[entry.action] ?? entry.action}
                    {entry.item_id ? ` · ${entry.item_id}` : ''}
                    {entry.changes?.version ? ` · ${versionText(entry.changes.version)}` : ''}
                    {entry.changes?.round ? ` · Round ${entry.changes.round}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)} · {entry.user}{entry.store_code ? ` (${entry.store_code})` : ''}</p>
                  <ResponseHistoryDetail entry={entry} />
                  {entry.changes?.item_ids && <p className="text-xs text-muted-foreground">{entry.changes.item_ids.join(', ')}</p>}
                  {entry.changes?.document_no && (
                    <p className="text-xs text-muted-foreground">Order {entry.changes.document_no}{entry.changes.net_amount ? ` · ${formatAmountOrDash(entry.changes.net_amount)}` : ''}</p>
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
                  {entry.changes?.mismatches?.map((m) => (
                    <p key={m.label} className="text-xs text-red-700 dark:text-red-300">{m.label}: {formatAmountOrDash(m.workflow)} vs {formatAmountOrDash(m.reference)}</p>
                  ))}
                  {entry.changes?.note && <p className="text-xs text-muted-foreground whitespace-pre-line">“{entry.changes.note}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {dialog === 'confirm' && (
        <ConfirmTicketOrderDialog
          ticket={ticket}
          pendingItems={pendingConfirmation}
          isOpen
          onOpenChange={(open) => setDialog(open ? 'confirm' : null)}
          isPending={action.isPending}
          advanceReceipt={advanceReceipt}
          onReceiptCreated={setAdvanceReceipt}
          onSave={(order) => run({ action: 'confirm_order', order }, 'Order confirmed and sent to CAD.', () => setAdvanceReceipt(null))}
        />
      )}
      {dialog === 'add' && (
        <AddProductDialog
          isOpen
          onOpenChange={(open) => setDialog(open ? 'add' : null)}
          isPending={action.isPending}
          onSave={(payload) => run({ action: 'add_item', ...payload }, 'Product added and sent to the CAD team.')}
        />
      )}
      <ReasonDialog
        isOpen={dialog === 'cancel'}
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        title="Cancel the whole ticket?"
        description="Every product on this ticket is cancelled. The CAD and workflow teams will see the reason."
        label="Cancellation reason"
        confirmLabel="Cancel ticket"
        confirmVariant="destructive"
        isPending={action.isPending}
        onConfirm={(reason) => run({ action: 'cancel', reason }, 'Ticket cancelled.')}
      />
    </div>
  );
}
