'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { Printer, RefreshCw } from 'lucide-react';

import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import DataTable from '@/components/shared/DataTable';
import PhoneLink from '@/components/shared/PhoneLink';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';
import { printZohoTable } from '../printZohoTable';

const ALL = 'all';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDay = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—');
const currentMonth = () => String(Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', month: 'numeric' }).format(new Date())));

/** Zoho leads with a birthday or anniversary, soonest first. Store logins get only their store's (enforced by the API). */
export default function ZohoBirthdaysPanel() {
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const activeStoreId = useSelector(selectActiveStoreId);
  const [month, setMonth] = useState(currentMonth());
  const [owner, setOwner] = useState(ALL);
  const [view, setView] = useState({ rows: [] });

  const query = useQuery({
    queryKey: ['admin', 'zoho-birthdays', activeStoreId, { month, owner }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals/birthdays?${new URLSearchParams({ type: ALL, month, owner })}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed to load birthdays (${res.status})`);
      return json;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const owners = query.data?.owners ?? [];
  const onViewChange = useCallback((v) => setView(v), []);
  const monthLabel = month === ALL ? 'All months' : MONTHS[Number(month) - 1];

  const columns = useMemo(() => [
    { key: 'next', label: 'Upcoming', mobile: true, format: (v) => <span className="whitespace-nowrap tabular-nums">{fmtDay(v)}</span> },
    {
      key: 'name', label: 'Name', mobile: true,
      format: (v, row) => (
        <span className="flex flex-col">
          <span className="wrap-break-word font-medium text-foreground">{v}</span>
          {row?.mobile && <PhoneLink phone={row.mobile} className="text-primary md:hidden" />}
        </span>
      ),
    },
    { key: 'mobile', label: 'Mobile', format: (v) => (v ? <PhoneLink phone={v} className="text-primary" /> : '—') },
    { key: 'kind', label: 'Occasion', filter: true, filterAlways: true },
    ...(isSuperAdmin ? [{ key: 'owner', label: 'Owner (store / team)', filter: true }] : []),
    { key: 'city', label: 'City', filter: true },
    { key: 'status', label: 'Lead status', hidden: true },
  ], [isSuperAdmin]);

  const print = () => printZohoTable({
    title: 'Zoho birthdays & anniversaries',
    subtitle: `${monthLabel}${owner !== ALL ? ` · ${owner}` : ''}`,
    columns: [
      { label: 'Upcoming', value: (r) => fmtDay(r.next) },
      { label: 'Occasion', value: (r) => r.kind },
      { label: 'Name', value: (r) => r.name },
      { label: 'Mobile', value: (r) => (r.mobile ? formatMobileWithCountryCode(r.mobile) : '') },
      { label: 'Owner (store / team)', value: (r) => r.owner },
      { label: 'City', value: (r) => r.city },
    ],
    rows: view.rows,
  });

  const toolbar = (
    <>
      <Select value={month} onValueChange={setMonth}>
        <SelectTrigger className="h-10 w-full md:h-9 md:w-40" aria-label="Month"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ALL}>All months</SelectItem>
          {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      {isSuperAdmin && (
        <Select value={owner} onValueChange={setOwner}>
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
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={query.refetch}
      toolbar={toolbar}
      actions={actions}
      onViewChange={onViewChange}
      emptyMessage={query.data?.scope?.mapped === false ? "This store isn't linked to a Zoho CRM owner yet — ask the admin team to link it." : `No birthdays or anniversaries in ${monthLabel.toLowerCase()}.`}
    />
  );
}
