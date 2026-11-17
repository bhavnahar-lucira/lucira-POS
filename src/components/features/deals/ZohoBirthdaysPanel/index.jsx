'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cake, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/shared/EmptyState';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import PhoneLink from '@/components/shared/PhoneLink';
import { printZohoTable } from '../printZohoTable';

const ALL = 'all';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDay = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
const currentMonth = () => String(Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', month: 'numeric' }).format(new Date())));

/** Zoho leads with a birthday or anniversary, read-only, soonest upcoming first. */
export default function ZohoBirthdaysPanel() {
  const [type, setType] = useState(ALL);
  const [month, setMonth] = useState(currentMonth());
  const [owner, setOwner] = useState(ALL);

  const query = useQuery({
    queryKey: ['admin', 'zoho-birthdays', { type, month, owner }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals/birthdays?${new URLSearchParams({ type, month, owner })}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed to load birthdays (${res.status})`);
      return json;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const rows = query.data?.rows ?? [];
  const owners = query.data?.owners ?? [];
  const monthLabel = month === ALL ? 'All months' : MONTHS[Number(month) - 1];

  const print = () => printZohoTable({
    title: `Zoho ${type === ALL ? 'birthdays & anniversaries' : `${type}s`}`,
    subtitle: `${monthLabel}${owner !== ALL ? ` · ${owner}` : ''}`,
    columns: [
      { label: 'Upcoming', value: (r) => fmtDay(r.next) },
      { label: 'Occasion', value: (r) => r.kind },
      { label: 'Name', value: (r) => r.name },
      { label: 'Mobile', value: (r) => r.mobile },
      { label: 'Owner (store / team)', value: (r) => r.owner },
      { label: 'City', value: (r) => r.city },
    ],
    rows,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Occasion
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10" aria-label="Occasion"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Birthdays & anniversaries</SelectItem>
              <SelectItem value="birthday">Birthdays</SelectItem>
              <SelectItem value="anniversary">Anniversaries</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Month
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-10" aria-label="Month"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>All months</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Owner (store / team)
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="h-10" aria-label="Owner"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL}>All owners</SelectItem>
              {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="button" variant="outline" className="h-10 flex-1 gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
          <Button type="button" className="h-10 flex-1 gap-1.5" onClick={print} disabled={!rows.length}>
            <Printer size={14} /> Print
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {query.isLoading ? 'Loading from Zoho…' : `${rows.length} record${rows.length === 1 ? '' : 's'} from Zoho leads, soonest upcoming first`}
      </p>

      {query.isLoading ? (
        <ListRowsSkeleton />
      ) : query.isError ? (
        <EmptyState icon={Cake} title="Couldn't load birthdays from Zoho" description={query.error?.message} />
      ) : !rows.length ? (
        <EmptyState icon={Cake} title="Nothing for this filter" description="Zoho has no matching birthdays or anniversaries — try another month or owner." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Upcoming</th>
                <th className="px-3 py-3">Occasion</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Mobile</th>
                <th className="px-3 py-3">Owner (store / team)</th>
                <th className="px-3 py-3">City</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{fmtDay(r.next)}</td>
                  <td className="px-3 py-3">{r.kind}</td>
                  <td className="px-3 py-3 font-medium text-foreground">{r.name}</td>
                  <td className="px-3 py-3">{r.mobile ? <PhoneLink phone={r.mobile} /> : '—'}</td>
                  <td className="px-3 py-3">{r.owner}</td>
                  <td className="px-3 py-3">{r.city ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
