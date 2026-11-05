'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { Download, Loader2, MessageSquareHeart, Plus, RefreshCw } from 'lucide-react';

import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/shared/EmptyState';
import VocSummary from '@/components/features/voc/VocSummary';
import VocDetailSheet from '@/components/features/voc/VocDetailSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVocResponses, useVocReferrals, useVocSkips } from '@/hooks/voc/useVoc';
import { useSalesPersonOptions } from '@/hooks/schemes/useSalesPersonOptions';
import { vocExportUrl } from '@/services/vocService';
import { QUESTIONS, answerLabel } from '@/lib/voc/questions';
import { todayDateString } from '@/lib/dateUtils';
import { selectActiveStoreId, selectActiveStoreName, selectAvailableStores } from '@/store/slices/storeSlice';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';

const ALL = 'all';
const PURCHASE_OPTIONS = QUESTIONS.find((q) => q.id === 'q7').options;

const monthStart = (month) => `${month}-01`;
function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  return last > todayDateString() ? todayDateString() : last;
}
const currentMonth = () => todayDateString().slice(0, 7);

const timeOf = (date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const dayLabel = (day) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

const REFERRAL_COLUMNS = (isSuperAdmin) => [
  { key: 'when', label: 'Date', mobile: true },
  { key: 'name', label: 'Referral', mobile: true },
  { key: 'mobile', label: 'Mobile', mobile: true },
  { key: 'referred_by', label: 'Referred by' },
  ...(isSuperAdmin ? [{ key: 'store', label: 'Store', filter: true }] : []),
  { key: 'jc', label: 'Jewelry Consultant', filter: true },
];

const SKIP_COLUMNS = (isSuperAdmin) => [
  { key: 'when', label: 'Date', mobile: true },
  { key: 'customer', label: 'Customer', mobile: true },
  { key: 'mobile', label: 'Mobile' },
  ...(isSuperAdmin ? [{ key: 'store', label: 'Store', filter: true }] : []),
  { key: 'stage', label: 'How', filter: true },
  { key: 'times', label: 'Times that day', align: 'right' },
  { key: 'feedback_later', label: 'Gave feedback later', filter: true },
  { key: 'by', label: 'Staff login' },
];

function FilterField({ label, children, className }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function VocPage() {
  const activeStoreId = useSelector(selectActiveStoreId);
  const activeStoreName = useSelector(selectActiveStoreName);
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const availableStores = useSelector(selectAvailableStores);

  const [from, setFrom] = useState(() => monthStart(currentMonth()));
  const [to, setTo] = useState(() => todayDateString());
  const [storeFilter, setStoreFilter] = useState(ALL);
  const [jcFilter, setJcFilter] = useState(ALL);
  const [purchased, setPurchased] = useState(ALL);
  const [showMobiles, setShowMobiles] = useState(false);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('feedback');

  const scopedStoreId = isSuperAdmin ? (storeFilter === ALL ? null : Number(storeFilter)) : activeStoreId;
  const { salesPersons } = useSalesPersonOptions(scopedStoreId);
  const filters = {
    from, to, purchased,
    storeId: isSuperAdmin ? storeFilter : undefined,
    jcId: scopedStoreId ? jcFilter : undefined,
  };
  const {
    responses, total, summary, hasMore, loadMore, isLoadingMore, isLoading, isFetching, isError, refetch,
  } = useVocResponses(filters, { mobiles: isSuperAdmin && showMobiles, enabled: isSuperAdmin || !!activeStoreId });

  const selectedMonth = from.slice(0, 7) === to.slice(0, 7) && from === monthStart(from.slice(0, 7)) && to === monthEnd(from.slice(0, 7))
    ? from.slice(0, 7) : '';
  const setMonth = (month) => {
    if (!month) return;
    setFrom(monthStart(month));
    setTo(monthEnd(month));
  };

  const handleViewChange = useCallback(({ columns }) => {
    setShowMobiles(columns.some((c) => c.key === 'mobile'));
  }, []);

  const columns = [
    { key: 'when', label: 'Date', mobile: true },
    { key: 'customer', label: 'Customer', mobile: true },
    ...(isSuperAdmin ? [{ key: 'store', label: 'Store', filter: true }] : []),
    { key: 'mobile', label: 'Mobile', hidden: true },
    { key: 'jc', label: 'Jewelry Consultant' },
    { key: 'purchased', label: 'Purchased' },
    { key: 'nps', label: 'Likely to recommend (0–10)', align: 'right' },
  ];
  const rows = responses.map((r) => ({
    id: r.id,
    when: `${dayLabel(r.day)}, ${timeOf(r.submitted_at)}`,
    customer: r.customer.name,
    store: r.store.name,
    mobile: r.customer.mobile,
    jc: r.jc.name,
    purchased: answerLabel('q7', r.answers.q7),
    nps: r.answers.q9,
    response: r,
  }));

  const referrals = useVocReferrals(filters, { enabled: isSuperAdmin || !!activeStoreId });
  const skips = useVocSkips(filters, { enabled: isSuperAdmin || !!activeStoreId });
  const referralRows = (referrals.data?.rows ?? []).map((r) => ({
    id: `${r.response_id}-${r.index}`,
    when: `${dayLabel(r.day)}, ${timeOf(r.submitted_at)}`,
    name: r.referral.name,
    mobile: r.referral.mobile,
    referred_by: r.customer.name,
    store: r.store.name,
    jc: r.jc.name,
  }));
  const skipRows = (skips.data?.rows ?? []).map((s) => ({
    id: s.id,
    when: `${dayLabel(s.day)}, ${timeOf(s.last_skipped_at)}`,
    customer: s.customer.name,
    mobile: s.customer.mobile,
    store: s.store.name,
    stage: s.stage === 'form' ? 'Closed the form' : 'Skipped at prompt',
    times: s.times,
    feedback_later: s.feedback_later ? 'Yes' : 'No',
    by: s.skipped_by,
  }));

  if (!isSuperAdmin && !activeStoreId) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to view Voice of Lucira.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Voice of Lucira</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Customer feedback · {isSuperAdmin
              ? (storeFilter === ALL ? 'all stores' : availableStores.find((s) => String(s.company_id) === storeFilter)?.mailing_name)
              : activeStoreName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
          </Button>
          {isSuperAdmin && (
            <Button asChild variant="outline" className="h-11 flex-1 gap-1.5 sm:flex-none">
              <a href={vocExportUrl(filters)} download>
                <Download size={16} aria-hidden="true" /> Export
              </a>
            </Button>
          )}
          {activeStoreId && (
            <Button asChild className="h-11 flex-1 gap-1.5 sm:flex-none">
              <Link href="/voc/new"><Plus size={16} aria-hidden="true" /> New feedback</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4 md:grid-cols-3 xl:grid-cols-6">
        <FilterField label="Month">
          <Input type="month" value={selectedMonth} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} className="h-11" aria-label="Month" />
        </FilterField>
        <FilterField label="From">
          <Input type="date" value={from} max={to || todayDateString()} onChange={(e) => setFrom(e.target.value)} className="h-11" aria-label="From date" />
        </FilterField>
        <FilterField label="To">
          <Input type="date" value={to} min={from || undefined} max={todayDateString()} onChange={(e) => setTo(e.target.value)} className="h-11" aria-label="To date" />
        </FilterField>
        {isSuperAdmin && (
          <FilterField label="Store">
            <Select value={storeFilter} onValueChange={(v) => { setStoreFilter(v); setJcFilter(ALL); }}>
              <SelectTrigger className="h-11 w-full" aria-label="Store"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                <SelectItem value={ALL}>All stores</SelectItem>
                {availableStores.map((s) => (
                  <SelectItem key={s.company_id} value={String(s.company_id)}>{s.mailing_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        )}
        {tab !== 'skipped' && <FilterField label="Jewelry Consultant">
          <Select value={jcFilter} onValueChange={setJcFilter} disabled={!scopedStoreId}>
            <SelectTrigger className="h-11 w-full" aria-label="Jewelry Consultant">
              <SelectValue placeholder={scopedStoreId ? 'All' : 'Pick a store first'} />
            </SelectTrigger>
            <SelectContent className="max-h-72 overflow-y-auto">
              <SelectItem value={ALL}>All consultants</SelectItem>
              {salesPersons.map((p) => (
                <SelectItem key={p.employee_id} value={String(p.employee_id)}>{p.employee_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>}
        {tab !== 'skipped' && <FilterField label="Purchased">
          <Select value={purchased} onValueChange={setPurchased}>
            <SelectTrigger className="h-11 w-full" aria-label="Purchased"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              {PURCHASE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="feedback" className="px-3">Feedback{isLoading ? '' : ` (${total})`}</TabsTrigger>
          <TabsTrigger value="referrals" className="px-3">Referrals{referrals.data ? ` (${referrals.data.total})` : ''}</TabsTrigger>
          <TabsTrigger value="skipped" className="px-3">Skipped{skips.data ? ` (${skips.data.total})` : ''}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'referrals' ? (
        <DataTable
          columns={REFERRAL_COLUMNS(isSuperAdmin)}
          rows={referralRows}
          isLoading={referrals.isLoading}
          isError={referrals.isError}
          onRetry={referrals.refetch}
          emptyMessage="No referrals for these filters."
        />
      ) : tab === 'skipped' ? (
        <DataTable
          columns={SKIP_COLUMNS(isSuperAdmin)}
          rows={skipRows}
          isLoading={skips.isLoading}
          isError={skips.isError}
          onRetry={skips.refetch}
          emptyMessage="No skipped feedback for these filters."
        />
      ) : isLoading ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading feedback…
        </p>
      ) : !isError && total === 0 ? (
        <EmptyState
          icon={MessageSquareHeart}
          title="No feedback for these filters."
          description={activeStoreId ? 'Take feedback at the end of a customer visit, or tap New feedback.' : 'Try a wider date range.'}
        />
      ) : (
        <>
          {!isError && <VocSummary summary={summary} />}
          <DataTable
            columns={columns}
            rows={rows}
            isError={isError}
            onRetry={refetch}
            emptyMessage="No feedback for these filters."
            onViewChange={isSuperAdmin ? handleViewChange : undefined}
            onRowClick={(row) => setSelected(row.response)}
          />
          {hasMore && (
            <Button type="button" variant="outline" className="h-11 self-center" onClick={() => loadMore()} disabled={isLoadingMore}>
              {isLoadingMore ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading…</> : `Load more (${rows.length} of ${total})`}
            </Button>
          )}
        </>
      )}

      <VocDetailSheet response={selected} onClose={() => setSelected(null)} canManage={isSuperAdmin} />
    </div>
  );
}
