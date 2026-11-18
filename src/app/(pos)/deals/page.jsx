'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';

import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { selectActiveStoreName } from '@/store/slices/storeSlice';
import { useZohoDeals } from '@/hooks/admin/useZohoDeals';
import DealDetailSheet from '@/components/features/deals/DealDetailSheet';
import ZohoMeetingsPanel from '@/components/features/deals/ZohoMeetingsPanel';
import ZohoBirthdaysPanel from '@/components/features/deals/ZohoBirthdaysPanel';
import DataTable from '@/components/shared/DataTable';
import PhoneLink from '@/components/shared/PhoneLink';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { formatDatePadded, formatDateTime, todayDateString } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

const PER_PAGE = 200;
const ALL = 'all';

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(preset) {
  const today = todayDateString();
  const d = new Date();
  switch (preset) {
    case 'today': return [today, today];
    case 'yesterday': d.setDate(d.getDate() - 1); return [isoDay(d), isoDay(d)];
    case '7days': d.setDate(d.getDate() - 7); return [isoDay(d), today];
    case 'thisMonth': return [`${today.slice(0, 8)}01`, today];
    case 'lastMonth': {
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return [`${isoDay(last).slice(0, 8)}01`, isoDay(last)];
    }
    default: return ['', ''];
  }
}

const STAGE_TONES = [
  [/won|converted/, 'bg-status-in-stock/10 text-status-in-stock border-status-in-stock/20'],
  [/lost|junk|not interested/, 'bg-destructive/10 text-destructive border-destructive/20'],
  [/negotiation|proposal|decision|appointment/, 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'],
  [/qualif|contact|lead|new/, 'bg-primary/10 text-primary border-primary/20'],
];

function StageBadge({ stage }) {
  if (!stage) return <span className="text-muted-foreground">—</span>;
  const tone = STAGE_TONES.find(([re]) => re.test(stage.toLowerCase()))?.[1] ?? 'bg-muted text-muted-foreground border-border';
  return <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', tone)}>{stage}</span>;
}

function Stat({ label, value, hint, className }) {
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3 sm:p-4', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

const stageIs = (deal, re) => re.test(String(deal.stage ?? '').toLowerCase());

export default function DealsPage() {
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const activeStoreName = useSelector(selectActiveStoreName);
  const [section, setSection] = useState('leads');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [owner, setOwner] = useState(ALL);
  const [datePreset, setDatePreset] = useState(ALL);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedDeal, setSelectedDeal] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, error, refetch, isFetching } = useZohoDeals(
    { page, perPage: PER_PAGE, store: owner, stage: ALL, search: debouncedSearch, fromDate, toDate },
    { enabled: section === 'leads' },
  );

  const scope = data?.scope;
  const moreRecords = !!data?.info?.more_records;

  const rows = useMemo(() => (data?.deals ?? []).map((d) => ({
    ...d,
    name: d.contactName || d.dealName || 'Unknown',
    source: d.leadSource || d.utmSource || null,
    occasion: d.purchaseReason || null,
  })), [data]);
  const owners = useMemo(() => (data?.summary?.stores ?? []).map((s) => s.name).sort(), [data]);

  const stats = useMemo(() => ({
    total: rows.length,
    fresh: rows.filter((d) => stageIs(d, /new/)).length,
    working: rows.filter((d) => !stageIs(d, /new|won|converted|lost|junk|not interested/)).length,
    appointments: rows.filter((d) => d.appointmentDateTime).length,
    closed: rows.filter((d) => stageIs(d, /won|converted/)).length,
  }), [rows]);

  const columns = useMemo(() => [
    { key: 'name', label: 'Customer', mobile: true, format: (v) => <span className="font-medium text-foreground">{v}</span> },
    { key: 'mobile', label: 'Mobile', mobile: true, format: (v) => (v ? <PhoneLink phone={v} className="text-primary" /> : '—') },
    { key: 'stage', label: 'Stage', filter: true, format: (v) => <StageBadge stage={v} /> },
    { key: 'storeExecutive', label: 'JC', filter: true },
    ...(isSuperAdmin ? [{ key: 'dealOwner', label: 'Owner (store / team)', filter: true }] : []),
    { key: 'source', label: 'Source', filter: true },
    { key: 'occasion', label: 'Occasion', filter: true },
    { key: 'appointmentDateTime', label: 'Appointment', format: (v) => (v ? formatDateTime(v) : '—') },
    { key: 'utmCampaign', label: 'Campaign', hidden: true },
    { key: 'intentStage', label: 'Intent', hidden: true },
    { key: 'email', label: 'Email', hidden: true },
    { key: 'dealScore', label: 'Score', align: 'right', hidden: true },
    { key: 'amount', label: 'Amount', align: 'right', hidden: true, format: (v) => (v > 0 ? formatAmountOrDash(v) : '—') },
    { key: 'createdTime', label: 'Created', format: (v) => (v ? formatDatePadded(v) : '—') },
  ], [isSuperAdmin]);

  const choosePreset = (preset) => {
    setDatePreset(preset);
    setPage(1);
    if (preset !== 'custom') {
      const [from, to] = presetRange(preset);
      setFromDate(from);
      setToDate(to);
    }
  };

  const rateLimited = /rate limit|cooling down|too many/i.test(error?.message ?? '');

  const toolbar = (
    <>
      <div className="relative w-full md:w-72">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Zoho by name or mobile"
          aria-label="Search Zoho leads"
          className="h-10 pl-8 md:h-9"
        />
      </div>
      <Select value={datePreset} onValueChange={choosePreset}>
        <SelectTrigger className="h-10 w-full md:h-9 md:w-40" aria-label="Created">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="7days">Last 7 days</SelectItem>
          <SelectItem value="thisMonth">This month</SelectItem>
          <SelectItem value="lastMonth">Last month</SelectItem>
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {datePreset === 'custom' && (
        <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
          <Input type="date" value={fromDate} max={toDate || todayDateString()} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-10 md:h-9 md:w-36" aria-label="From date" />
          <Input type="date" value={toDate} min={fromDate || undefined} max={todayDateString()} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-10 md:h-9 md:w-36" aria-label="To date" />
        </div>
      )}
      {(fromDate || toDate) && (
        <Button type="button" variant="ghost" size="sm" className="gap-1 self-start md:self-auto" onClick={() => choosePreset(ALL)}>
          <X size={14} aria-hidden="true" /> Clear dates
        </Button>
      )}
      {isSuperAdmin && (
        <Select value={owner} onValueChange={(v) => { setOwner(v); setPage(1); }}>
          <SelectTrigger className="h-10 w-full md:h-9 md:w-52" aria-label="Owner">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>All owners (store / team)</SelectItem>
            {owner !== ALL && !owners.includes(owner) && <SelectItem value={owner}>{owner}</SelectItem>}
            {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4 p-4 pb-8 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? 'Zoho CRM leads, meetings and occasions for every store · read-only'
            : <>Zoho CRM records for <strong className="font-medium text-foreground">{activeStoreName || scope?.storeName || 'your store'}</strong> · read-only</>}
        </p>
        {section === 'leads' && (
          <Button type="button" variant="outline" className="h-10 gap-1.5 self-start sm:self-auto" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} aria-hidden="true" /> Refresh
          </Button>
        )}
      </div>

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="grid h-11 w-full grid-cols-3 sm:inline-grid sm:w-auto">
          <TabsTrigger value="leads" className="px-4">Leads</TabsTrigger>
          <TabsTrigger value="meetings" className="px-4">Meetings</TabsTrigger>
          <TabsTrigger value="birthdays" className="px-4">
            <span className="sm:hidden">Occasions</span>
            <span className="hidden sm:inline">Birthdays & Anniversaries</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {scope && !scope.mapped && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {scope.storeName ?? 'This store'} is not linked to a Zoho CRM owner yet, so there is nothing to show. Ask the admin team to link it.
        </p>
      )}

      {section === 'meetings' && <ZohoMeetingsPanel />}
      {section === 'birthdays' && <ZohoBirthdaysPanel />}

      {section === 'leads' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Leads loaded" value={isLoading ? '…' : stats.total} hint={moreRecords ? 'More on the next page' : null} />
            <Stat label="New" value={isLoading ? '…' : stats.fresh} />
            <Stat label="In follow-up" value={isLoading ? '…' : stats.working} />
            <Stat label="With appointment" value={isLoading ? '…' : stats.appointments} />
            <Stat label="Converted" value={isLoading ? '…' : stats.closed} className="col-span-2 sm:col-span-1" />
          </div>

          {isError && rateLimited && (
            <p className="text-xs text-muted-foreground">Zoho is rate-limiting requests — wait about a minute, then press Refresh.</p>
          )}

          <DataTable
            columns={columns}
            rows={rows}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            searchable={false}
            toolbar={toolbar}
            onRowClick={setSelectedDeal}
            emptyMessage={debouncedSearch || fromDate || toDate || owner !== ALL ? 'No Zoho leads match these filters.' : 'No Zoho leads yet.'}
          />

          {(page > 1 || moreRecords) && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Button type="button" variant="outline" size="sm" className="gap-1" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} aria-hidden="true" /> Previous {PER_PAGE}
              </Button>
              <span className="px-2 text-muted-foreground">Zoho page {page}</span>
              <Button type="button" variant="outline" size="sm" className="gap-1" disabled={!moreRecords || isFetching} onClick={() => setPage((p) => p + 1)}>
                Next {PER_PAGE} <ChevronRight size={14} aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}

      <DealDetailSheet deal={selectedDeal} isOpen={!!selectedDeal} onClose={() => setSelectedDeal(null)} />
    </div>
  );
}
