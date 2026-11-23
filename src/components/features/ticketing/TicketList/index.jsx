'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import DataTable from '@/components/shared/DataTable';
import { ResponseBadge, useNow } from '@/components/features/ticketing/ResponseTimer';
import { activeHold, mostUrgentStep } from '@/lib/ticketing/responseTimer';
import { useTickets } from '@/hooks/ticketing/useTickets';
import { ticketStatusLabel } from '@/lib/ticketing/constants';
import { formatDatePadded } from '@/lib/dateUtils';
import { formatAmountOrDash } from '@/lib/priceUtils';

export const ticketHref = (ticketNumber, partyId) =>
  `/ticketing/${encodeURIComponent(ticketNumber)}${partyId ? `?partyId=${partyId}` : ''}`;

/** One line per product of a multi-product ticket, so each product's category, budget and stage is visible. */
function ProductLines({ row, field }) {
  return (
    <ul className="flex flex-col gap-0.5 text-left">
      {row.products.map((p) => {
        const cancelled = p.status === 'cancelled';
        const value = field === 'category'
          ? `${p.item_id.split('-').at(-1)}. ${p.requested_specs?.category ?? '—'}`
          : field === 'budget' ? formatAmountOrDash(p.requested_specs?.budget)
            : field === 'design' ? (p.latest_design_label ?? '—') : ticketStatusLabel(p.status);
        return <li key={p.item_id} className={`whitespace-nowrap ${cancelled ? 'text-muted-foreground line-through' : ''}`}>{value}</li>;
      })}
      {field === 'budget' && row.budget != null && <li className="border-t border-border pt-0.5 font-semibold">{formatAmountOrDash(row.budget)}</li>}
      {field === 'status' && <li className="pt-0.5 text-xs text-muted-foreground">{ticketStatusLabel(row.status)}</li>}
    </ul>
  );
}

/** The active store's tickets, or — with partyId — that customer's tickets from every store. */
export default function TicketList({ partyId }) {
  const router = useRouter();
  const { data: tickets = [], isFetching, isError, refetch } = useTickets({ partyId });
  const now = useNow(60 * 1000);

  const columns = useMemo(() => [
    {
      key: 'ticket_number',
      label: 'Ticket No.',
      mobile: true,
      format: (v) => (
        <Link href={ticketHref(v, partyId)} onClick={(e) => e.stopPropagation()} className="font-medium text-primary hover:underline">
          {v}
        </Link>
      ),
    },
    { key: 'created_at',        label: 'Created', format: (v) => (v ? formatDatePadded(v) : '—') },
    { key: 'customer_name',     label: 'Customer' },
    { key: 'category',          label: 'Category', filter: true, format: (v, row) => (row?.products ? <ProductLines row={row} field="category" /> : v ?? '—') },
    { key: 'budget',            label: 'Budget', align: 'right', format: (v, row) => (row?.products ? <ProductLines row={row} field="budget" /> : formatAmountOrDash(v)) },
    { key: 'store_code',        label: 'Store', filter: true },
    { key: 'sales_person_name', label: 'Jewelry Consultant' },
    { key: 'latest_design_label', label: 'Design', format: (v, row) => (row?.products ? <ProductLines row={row} field="design" /> : v ?? '—') },
    { key: 'status_label',      label: 'Status', filter: true, mobile: true, format: (v, row) => (row?.products ? <ProductLines row={row} field="status" /> : v) },
    {
      key: 'response_text',
      label: 'Store response',
      filter: true,
      format: (v, row) => (row?.response ? <ResponseBadge timing={row.response} /> : row?.on_hold ? <span className="text-xs font-medium text-amber-700 dark:text-amber-300">On hold</span> : '—'),
    },
  ], [partyId]);

  const rows = useMemo(() => tickets.map((t) => {
    const timing = mostUrgentStep(t, now)?.timing ?? null;
    const response = {
      response: timing,
      on_hold: !!activeHold(t.holds),
      response_text: timing ? (timing.state === 'delayed' || timing.delayed_minutes ? 'Delayed' : timing.state === 'on_hold' ? 'On hold' : 'Within time') : activeHold(t.holds) ? 'On hold' : 'Not with store',
    };
    return { ...response, ...rowFields(t) };
  }), [tickets, now]);

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isFetching && !tickets.length}
      isError={isError}
      onRetry={refetch}
      onRowClick={(row) => router.push(ticketHref(row.ticket_number, partyId))}
      emptyMessage={partyId ? 'No tickets for this customer yet.' : 'No tickets raised from this store yet.'}
    />
  );
}

function rowFields(t) {
  return (t.items
    ? {
      ...t,
      products: t.items,
      category: [...new Set(t.items.map((i) => i.requested_specs?.category).filter(Boolean))].join(', ') || null,
      budget: t.budget_total ?? null,
      status_label: ticketStatusLabel(t.status),
    }
    : {
      ...t,
      category: t.specs?.category ?? null,
      budget: t.specs?.budget ?? null,
      status_label: ticketStatusLabel(t.status),
    });
}
