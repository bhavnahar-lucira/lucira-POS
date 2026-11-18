'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { ChevronLeft, ChevronRight, Printer, RefreshCw } from 'lucide-react';

import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import DataTable from '@/components/shared/DataTable';
import PhoneLink from '@/components/shared/PhoneLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';
import { printZohoTable } from '../printZohoTable';

const ALL = 'all';
const istDate = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
  .format(new Date(Date.now() + offsetDays * 864e5));
const RANGES = {
  today: ['Today', 0, 0],
  tomorrow: ['Tomorrow', 1, 1],
  next7: ['Next 7 days', 0, 7],
  next30: ['Next 30 days', 0, 30],
  last7: ['Last 7 days', -7, 0],
  last30: ['Last 30 days', -30, 0],
};
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

/** Zoho "Meetings" (Events), read-only. Store logins get only their store's meetings (enforced by the API). */
export default function ZohoMeetingsPanel() {
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const activeStoreId = useSelector(selectActiveStoreId);
  const [range, setRange] = useState('next30');
  const [fromDate, setFromDate] = useState(istDate(0));
  const [toDate, setToDate] = useState(istDate(30));
  const [owner, setOwner] = useState(ALL);
  const [page, setPage] = useState(1);
  const [view, setView] = useState({ rows: [] });

  const query = useQuery({
    queryKey: ['admin', 'zoho-meetings', activeStoreId, { fromDate, toDate, owner, page }],
    queryFn: async () => {
      const q = new URLSearchParams({ fromDate, toDate, owner, page: String(page), perPage: '200' });
      const res = await fetch(`/api/admin/deals/meetings?${q}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed to load meetings (${res.status})`);
      return json;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const meetings = useMemo(() => query.data?.meetings ?? [], [query.data]);
  const owners = query.data?.owners ?? [];
  const moreRecords = !!query.data?.info?.more_records;
  const onViewChange = useCallback((v) => setView(v), []);
  const reset = (fn) => (v) => { fn(v); setPage(1); };
  const chooseRange = (key) => {
    setRange(key);
    setPage(1);
    if (RANGES[key]) {
      setFromDate(istDate(RANGES[key][1]));
      setToDate(istDate(RANGES[key][2]));
    }
  };
  const rangeLabel = RANGES[range]?.[0] ?? `${fromDate || 'any'} to ${toDate || 'any'}`;

  const columns = useMemo(() => [
    {
      key: 'start', label: 'Date & time', mobile: true,
      format: (v) => (v ? (
        <span className="flex flex-col tabular-nums">
          <span className="whitespace-nowrap">{new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span className="whitespace-nowrap text-xs text-muted-foreground">{new Date(v).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
        </span>
      ) : '—'),
    },
    {
      key: 'customer', label: 'Customer', mobile: true,
      format: (v, row) => (
        <span className="flex flex-col">
          <span className="wrap-break-word font-medium text-foreground">{v ?? '—'}</span>
          {row?.mobile && <PhoneLink phone={row.mobile} className="text-primary md:hidden" />}
        </span>
      ),
    },
    { key: 'mobile', label: 'Mobile', format: (v) => (v ? <PhoneLink phone={v} className="text-primary" /> : '—') },
    { key: 'title', label: 'Meeting', filter: true },
    { key: 'jc', label: 'JC', filter: true },
    ...(isSuperAdmin ? [{ key: 'store', label: 'Store', filter: true }, { key: 'owner', label: 'Booked by', filter: true }] : []),
    { key: 'venue', label: 'Venue' },
    { key: 'description', label: 'Notes', hidden: true },
  ], [isSuperAdmin]);

  const print = () => printZohoTable({
    title: 'Zoho meetings',
    subtitle: `${rangeLabel} (${fromDate || 'any'} to ${toDate || 'any'})${owner !== ALL ? ` · ${owner}` : ''}`,
    columns: [
      { label: 'Date & time', value: (m) => fmt(m.start) },
      { label: 'Customer', value: (m) => m.customer },
      { label: 'Mobile', value: (m) => (m.mobile ? formatMobileWithCountryCode(m.mobile) : '') },
      { label: 'Meeting', value: (m) => m.title },
      { label: 'JC', value: (m) => m.jc },
      { label: 'Store', value: (m) => m.store },
      { label: 'Booked by', value: (m) => m.owner },
      { label: 'Venue', value: (m) => m.venue },
      { label: 'Notes', value: (m) => m.description },
    ],
    rows: view.rows,
  });

  const toolbar = (
    <>
      <Select value={range} onValueChange={chooseRange}>
        <SelectTrigger className="h-10 w-full md:h-9 md:w-44" aria-label="Meeting dates"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(RANGES).map(([key, [label]]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {range === 'custom' && (
        <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
          <label className="flex flex-col gap-0.5 text-xs text-muted-foreground md:flex-row md:items-center md:gap-1.5">
            From
            <Input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => reset(setFromDate)(e.target.value)} className="h-10 md:h-9 md:w-36" />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-muted-foreground md:flex-row md:items-center md:gap-1.5">
            To
            <Input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => reset(setToDate)(e.target.value)} className="h-10 md:h-9 md:w-36" />
          </label>
        </div>
      )}
      {isSuperAdmin && (
        <Select value={owner} onValueChange={reset(setOwner)}>
          <SelectTrigger className="h-10 w-full md:h-9 md:w-52" aria-label="Owner"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>All owners (store / team)</SelectItem>
            {owner !== ALL && !owners.includes(owner) && <SelectItem value={owner}>{owner}</SelectItem>}
            {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </>
  );

  const actions = (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => query.refetch()} disabled={query.isFetching}>
        <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
      </Button>
      <Button type="button" size="sm" className="gap-1.5" onClick={print} disabled={!view.rows.length}>
        <Printer size={14} aria-hidden="true" /> Print
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        rows={meetings}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={query.refetch}
        toolbar={toolbar}
        actions={actions}
        onViewChange={onViewChange}
        emptyMessage={query.data?.scope?.mapped === false ? "This store isn't linked to a Zoho CRM owner yet — ask the admin team to link it." : `No meetings for ${rangeLabel.toLowerCase()}.`}
      />
      {(page > 1 || moreRecords) && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button type="button" variant="outline" size="sm" className="gap-1" disabled={page <= 1 || query.isFetching} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={14} aria-hidden="true" /> Previous
          </Button>
          <span className="px-2 text-muted-foreground">Zoho page {page}</span>
          <Button type="button" variant="outline" size="sm" className="gap-1" disabled={!moreRecords || query.isFetching} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
