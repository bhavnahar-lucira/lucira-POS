'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import DataTable from '@/components/shared/DataTable';
import { useTickets } from '@/hooks/ticketing/useTickets';
import { ticketStatusLabel } from '@/lib/ticketing/constants';
import { formatDatePadded } from '@/lib/dateUtils';
import { formatAmountOrDash } from '@/lib/priceUtils';

export const ticketHref = (ticketNumber, partyId) =>
  `/ticketing/${encodeURIComponent(ticketNumber)}${partyId ? `?partyId=${partyId}` : ''}`;

/** The active store's tickets, or — with partyId — that customer's tickets from every store. */
export default function TicketList({ partyId }) {
  const router = useRouter();
  const { data: tickets = [], isFetching, isError, refetch } = useTickets({ partyId });

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
    { key: 'category',          label: 'Category', filter: true },
    { key: 'budget',            label: 'Budget', align: 'right', format: formatAmountOrDash },
    { key: 'store_code',        label: 'Store', filter: true },
    { key: 'sales_person_name', label: 'Sales Person' },
    { key: 'latest_design_label', label: 'Design', format: (v) => v ?? '—' },
    { key: 'status_label',      label: 'Status', filter: true, mobile: true },
  ], [partyId]);

  const rows = useMemo(() => tickets.map((t) => ({
    ...t,
    category: t.specs?.category ?? null,
    budget: t.specs?.budget ?? null,
    status_label: ticketStatusLabel(t.status),
  })), [tickets]);

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
