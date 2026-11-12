'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ShoppingCart } from 'lucide-react';

import InlineLoader from '@/components/shared/InlineLoader';
import InvoiceReportButton from '@/components/features/checkout/InvoiceReportButton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCustomEstimateItems } from '@/hooks/estimation/useCustomEstimate';
import { useItemGroups } from '@/hooks/catalog/useCategoryFilters';
import { useAttributeOptions, useKaratOptions } from '@/hooks/catalog/useCatalogFilterOptions';
import { useTicketAction } from '@/hooks/ticketing/useTickets';
import { createEstimationTempVoucher } from '@/services/customEstimateService';
import { buildOrderFromFinal } from '@/lib/ticketing/orderFromFinal';
import {
  addItem, attachCustomer, detachCustomer, removeItem, selectCartCustomerId, selectCartItems,
} from '@/store/slices/cartSlice';
import { resolveImageSrc } from '@/lib/resolveImageSrc';
import { normalizeCustomer, isMaskedValue } from '@/lib/normalizers/customer';
import { retrieveCustomer } from '@/services/customerService';
import { formatAmountOrDash } from '@/lib/priceUtils';
import APP_CONFIG from '@/constants/appConfig';

const formatValue = (value, unit) => {
  if (value == null) return '—';
  return unit === '' ? String(value) : formatAmountOrDash(value);
};

const diffText = (c) => {
  if (c.workflow == null || c.reference == null) return '';
  const diff = c.workflow - c.reference;
  const pct = c.reference ? ` (${diff > 0 ? '+' : ''}${((diff / c.reference) * 100).toFixed(1)}%)` : '';
  return c.unit === '' ? `${diff > 0 ? '+' : ''}${Number.isInteger(diff) ? diff : diff.toFixed(3)}` : `${diff > 0 ? '+' : '−'}${formatAmountOrDash(Math.abs(diff))}${pct}`;
};

function CheckIcon({ ok }) {
  return ok
    ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Matches" />
    : <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-label="Mismatch" />;
}

function ChecksList({ checks }) {
  return (
    <ul className="flex flex-col gap-2 sm:hidden">
      {checks.map((c) => (
        <li
          key={c.label}
          className={`flex flex-col gap-1.5 rounded-lg border p-3 text-sm ${c.ok ? 'border-border bg-background' : 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'}`}
        >
          <span className="flex items-start gap-1.5 font-medium">
            <CheckIcon ok={c.ok} />
            <span>{c.label}{c.note ? ` — ${c.note}` : ''}</span>
          </span>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div><dt className="opacity-70">Workflow</dt><dd className="tabular-nums">{formatValue(c.workflow, c.unit)}</dd></div>
            <div><dt className="opacity-70">Expected</dt><dd className="tabular-nums">{formatValue(c.reference, c.unit)}</dd></div>
            <div><dt className="opacity-70">Difference</dt><dd className={`tabular-nums ${c.ok ? '' : 'font-semibold'}`}>{c.ok ? '—' : diffText(c)}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function ChecksTable({ checks }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Check</th>
            <th className="px-3 py-2 text-right font-medium">Workflow team</th>
            <th className="px-3 py-2 text-right font-medium">Expected</th>
            <th className="px-3 py-2 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.label} className={`border-t border-border ${c.ok ? '' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'}`}>
              <td className="px-3 py-2">
                <span className="inline-flex items-start gap-1.5">
                  <CheckIcon ok={c.ok} />
                  <span>{c.label}{c.note ? ` — ${c.note}` : ''}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatValue(c.workflow, c.unit)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatValue(c.reference, c.unit)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${c.ok ? 'text-muted-foreground' : 'font-semibold'}`}>{c.ok ? '—' : diffText(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Builds the order straight from the workflow team's final details, highlighting anything that doesn't match OrnaVerse. */
export default function TicketOrderPanel({ ticket, partyId, onRequestChanges }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const cartCustomerId = useSelector(selectCartCustomerId);
  const cartItems = useSelector(selectCartItems);
  const action = useTicketAction(ticket.ticket_number, { partyId });
  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);

  const { items } = useCustomEstimateItems();
  const { data: itemGroupsRaw } = useItemGroups();
  const stoneItemGroups = (itemGroupsRaw ?? []).filter((g) => g.base_item_id === APP_CONFIG.CUSTOM_ESTIMATE_STONE_BASE_ITEM_ID);
  const { options: karatOptions } = useKaratOptions();
  const { options: metalColorOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.METAL_COLOR);
  const { options: shapeOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.DIAMOND_SHAPE);
  const { options: colorOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.STONE_COLOR);
  const { options: qualityOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.STONE_QUALITY);
  const lookupsReady = items.length > 0 && karatOptions.length > 0 && metalColorOptions.length > 0
    && stoneItemGroups.length > 0 && shapeOptions.length > 0 && colorOptions.length > 0 && qualityOptions.length > 0;

  const final = ticket.final_details;
  const query = useQuery({
    queryKey: ['ticket-order', ticket.ticket_number, ticket.updated_at],
    queryFn: () => buildOrderFromFinal(final, ticket, {
      items, karatOptions, metalColorOptions, stoneItemGroups, shapeOptions, colorOptions, qualityOptions,
    }),
    enabled: !!final && lookupsReady,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!lookupsReady || query.isLoading) return <InlineLoader label="Building the order from the workflow team's final details…" />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <p>{query.error?.message ?? 'The order could not be built.'}</p>
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  const { blockers = [], warnings = [], checks = [], line, item, summary } = query.data ?? {};
  const mismatches = checks.filter((c) => !c.ok);
  const canProceed = !blockers.length && !!line && (!mismatches.length || acknowledged);

  const recordAcknowledgement = () => (mismatches.length
    ? action.mutateAsync({
      action: 'acknowledge_pricing',
      mismatches: mismatches.map((c) => ({ label: c.label, workflow: c.workflow ?? null, reference: c.reference ?? null })),
      note: note.trim() || null,
    })
    : Promise.resolve());

  const handleCheckout = async () => {
    try {
      await recordAcknowledgement();
    } catch (err) {
      return toast.error(err.message);
    }
    // The order is always for the ticket's customer — re-attached here if they were logged out (e.g. idle timeout)
    // or another customer is on the cart.
    if (cartCustomerId !== ticket.customer_party_id) {
      setIsAttaching(true);
      let customer = null;
      try {
        customer = normalizeCustomer((await retrieveCustomer(ticket.customer_party_id))?.data?.Entity);
      } catch {
        customer = null;
      } finally {
        setIsAttaching(false);
      }
      if (customer?.customerId !== ticket.customer_party_id) {
        customer = {
          customerId: ticket.customer_party_id,
          customerName: ticket.customer_name,
          customerMobile: ticket.customer_mobile,
          customerAddress: normalizeCustomer({ party_id: ticket.customer_party_id, ...ticket.customer_profile })?.customerAddress ?? null,
        };
      }
      if (cartCustomerId) dispatch(detachCustomer());
      dispatch(attachCustomer({
        customerId: customer.customerId,
        customerName: customer.customerName,
        customerMobile: customer.customerMobile,
        customerAddress: customer.customerAddress ?? null,
        customerContactMobile: isMaskedValue(ticket.customer_mobile) ? null : ticket.customer_mobile,
      }));
      toast.success(`Customer ${customer.customerName} logged in from ticket ${ticket.ticket_number}.`);
    }
    // A custom line left in the saved cart (an earlier estimate, or an earlier try at this ticket) would be
    // ordered alongside this one, so only the line built from this ticket's current data goes to checkout.
    const staleLines = (cartCustomerId === ticket.customer_party_id ? cartItems : []).filter((i) => i.customLine);
    for (const stale of staleLines) {
      dispatch(removeItem({
        itemId: stale.itemId, sizeId: stale.sizeId, styleId: stale.styleId,
        freeGiftPromoCode: stale.freeGiftPromoCode ?? null, customLineId: stale.customLineId,
      }));
    }
    if (staleLines.length) toast.info('An earlier custom order line was removed from the cart.');
    dispatch(addItem({
      itemId: item.item_id,
      itemCode: item.item_code,
      itemName: item.item_name,
      quantity: 1,
      unitPrice: summary.subTotal,
      sizeId: line.item_size_id ?? null,
      sizeName: summary.sizeName,
      attributes: { karat: summary.karat, metal_color: summary.color },
      image: summary.imagePath ? resolveImageSrc(summary.imagePath) : null,
      productUrl: null,
      hasStock: false,
      customLineId: crypto.randomUUID(),
      customLine: line,
      ticketNumber: ticket.ticket_number,
    }));
    toast.success(`Order for ${ticket.ticket_number} added to the cart.`);
    router.push('/checkout');
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:p-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order from the workflow team&apos;s final details</span>
        <p className="text-sm text-foreground">
          {summary
            ? <>The order uses the workflow team&apos;s figures exactly: <strong>{summary.itemName}</strong>, {summary.karat}{summary.color ? ` ${summary.color}` : ''}, {summary.weight} g · net <strong>{formatAmountOrDash(summary.netAmount)}</strong>.</>
            : 'The order cannot be built from these final details.'}
        </p>
      </div>

      {blockers.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-medium">The order can&apos;t be placed until the workflow team corrects:</p>
          <ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-amber-800 dark:text-amber-200">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}

      {checks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={`text-sm font-medium ${mismatches.length ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
            {mismatches.length
              ? `${mismatches.length} figure${mismatches.length > 1 ? 's' : ''} from the workflow team don't match — check before ordering, or request changes.`
              : 'All figures match OrnaVerse.'}
          </p>
          <ChecksList checks={checks} />
          <ChecksTable checks={checks} />
        </div>
      )}

      {summary && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-background p-3 text-sm sm:grid-cols-3">
          {[
            ['Metal', `${formatAmountOrDash(summary.metalAmount)} @ ${formatAmountOrDash(summary.metalRate)}/g`],
            ['Diamonds / stones', formatAmountOrDash(summary.stonesTotal)],
            ['Labour', summary.labourAmount ? `${formatAmountOrDash(summary.labourAmount)} @ ${formatAmountOrDash(summary.labourRate)}/g` : '—'],
            ['Sub total', formatAmountOrDash(summary.subTotal)],
            ['Tax', formatAmountOrDash(summary.taxAmount)],
            ['Net amount', formatAmountOrDash(summary.netAmount)],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={`tabular-nums ${label === 'Net amount' ? 'font-semibold' : ''}`}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {!blockers.length && mismatches.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-300 bg-background p-3 dark:border-red-800">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span>I have checked the highlighted differences and want to place the order with the workflow team&apos;s figures.</span>
          </label>
          <Label htmlFor="ack-note" className="text-xs text-muted-foreground">Note (optional, saved in the ticket history)</Label>
          <Textarea id="ack-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={onRequestChanges}>Request changes</Button>
        {line && !blockers.length && (
          <div className="w-full sm:w-48">
            <InvoiceReportButton
              resolveTransactionId={() => createEstimationTempVoucher(line)}
              optKey="transaction_item_id"
              documentId={APP_CONFIG.DOCUMENT_TYPES.ESTIMATION}
              documentLabel="Estimate"
            />
          </div>
        )}
        <Button type="button" className="h-11 w-full gap-1.5 sm:w-auto" disabled={!canProceed || action.isPending || isAttaching} onClick={handleCheckout}>
          <ShoppingCart size={16} aria-hidden="true" /> {isAttaching ? 'Logging in customer…' : action.isPending ? 'Saving…' : 'Proceed to checkout'}
        </Button>
      </div>
    </div>
  );
}
