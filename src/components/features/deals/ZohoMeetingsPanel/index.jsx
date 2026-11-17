'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/shared/EmptyState';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import { printZohoTable } from '../printZohoTable';

const ALL = 'all';
const istDate = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
  .format(new Date(Date.now() + offsetDays * 864e5));
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

/** Zoho "Meetings" (Events), read-only, with owner (store / team), date and search filters. */
export default function ZohoMeetingsPanel() {
  const [fromDate, setFromDate] = useState(istDate(0));
  const [toDate, setToDate] = useState(istDate(30));
  const [owner, setOwner] = useState(ALL);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin', 'zoho-meetings', { fromDate, toDate, owner, search, page }],
    queryFn: async () => {
      const q = new URLSearchParams({ fromDate, toDate, owner, search: search.trim(), page: String(page), perPage: '200' });
      const res = await fetch(`/api/admin/deals/meetings?${q}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed to load meetings (${res.status})`);
      return json;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const meetings = query.data?.meetings ?? [];
  const owners = query.data?.owners ?? [];
  const resetPage = (fn) => (v) => { fn(v); setPage(1); };

  const print = () => printZohoTable({
    title: 'Zoho meetings',
    subtitle: `${fromDate || 'any'} to ${toDate || 'any'}${owner !== ALL ? ` · ${owner}` : ''}`,
    columns: [
      { label: 'Date & time', value: (m) => fmt(m.start) },
      { label: 'Meeting', value: (m) => m.title },
      { label: 'Customer', value: (m) => m.customer },
      { label: 'Owner (store / team)', value: (m) => m.owner },
      { label: 'Venue', value: (m) => m.venue },
      { label: 'Notes', value: (m) => m.description },
    ],
    rows: meetings,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          From
          <Input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => resetPage(setFromDate)(e.target.value)} className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          To
          <Input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => resetPage(setToDate)(e.target.value)} className="h-10" />
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Owner (store / team)
          <Select value={owner} onValueChange={resetPage(setOwner)}>
            <SelectTrigger className="h-10" aria-label="Owner"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>All owners</SelectItem>
              {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Meeting title starts with
          <Input value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} placeholder="e.g. Store Visit" className="h-10" />
        </label>
        <div className="flex items-end gap-2">
          <Button type="button" variant="outline" className="h-10 flex-1 gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
          <Button type="button" className="h-10 flex-1 gap-1.5" onClick={print} disabled={!meetings.length}>
            <Printer size={14} /> Print
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {query.isLoading ? 'Loading from Zoho…' : `${meetings.length} meeting${meetings.length === 1 ? '' : 's'} from Zoho, soonest first`}
        {query.data?.info?.more_records ? ' — more on the next page' : ''}
      </p>

      {query.isLoading ? (
        <ListRowsSkeleton />
      ) : query.isError ? (
        <EmptyState icon={CalendarClock} title="Couldn't load meetings from Zoho" description={query.error?.message} />
      ) : !meetings.length ? (
        <EmptyState icon={CalendarClock} title="No meetings in this range" description="Change the dates or owner filter." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date & time</th>
                <th className="px-3 py-3">Meeting</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Owner (store / team)</th>
                <th className="px-3 py-3">Venue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {meetings.map((m) => (
                <tr key={m.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{fmt(m.start)}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-foreground">{m.title}</p>
                    {m.description && <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>}
                  </td>
                  <td className="px-3 py-3">{m.customer ?? '—'}</td>
                  <td className="px-3 py-3">{m.owner}</td>
                  <td className="px-3 py-3">{m.venue ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || query.data?.info?.more_records) && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <Button variant="outline" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="px-2 font-medium">Page {page}</span>
          <Button variant="outline" size="sm" disabled={!query.data?.info?.more_records || query.isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
