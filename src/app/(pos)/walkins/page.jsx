'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { Footprints, UserPlus, X, Search, SlidersHorizontal, UserRound, Megaphone, Gem, Wallet, ClipboardPen, StickyNote } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import { StaggerList } from '@/components/shared/StaggerList';
import BottomSheet from '@/components/shared/BottomSheet';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import WalkInRegisterForm from '@/components/features/customers/WalkInRegisterForm';
import TakeFeedbackButton from '@/components/features/voc/TakeFeedbackButton';
import { useCrmVisits } from '@/hooks/customer/useCrmVisits';
import { useSources } from '@/hooks/customer/useSources';
import { useCategories } from '@/hooks/catalog/useCategoryFilters';
import { selectActiveStoreId, selectActiveStoreName } from '@/store/slices/storeSlice';
import { todayDateString } from '@/lib/dateUtils';
import PhoneLink from '@/components/shared/PhoneLink';
import { formatAmountOrNull } from '@/lib/priceUtils';
import { WALKIN_PURPOSES } from '@/constants/walkin';

const isStoreWalkin = (visit) => !visit.source || /walk/i.test(visit.source);
const last4 = (mobile) => String(mobile ?? '').replace(/\D/g, '').slice(-4);
const visitKey = (mobile, iso) => `${last4(mobile)}|${iso ? new Date(iso).toDateString() : ''}`;
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? 'th'}`;
const ALL = 'all';
const NOT_RECORDED = 'none';
const CONVERTING = ['Sales', 'Order'];

function fmtVisitedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Line({ icon: Icon, children }) {
  if (!children) return null;
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
      <Icon size={13} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </div>
  );
}

function VisitCard({ visit }) {
  const { detail, record } = visit;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{visit.customerName ?? 'Unknown customer'}</p>
          <p className="text-xs text-muted-foreground mt-0.5"><PhoneLink phone={visit.mobile} /></p>
        </div>
        <p className="text-xs text-muted-foreground text-right shrink-0">{fmtVisitedAt(visit.visitedAt)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {record?.purpose && <Badge>{record.purpose}</Badge>}
        {visit.visitNumber && <Badge variant="secondary">{visit.visitNumber === 1 ? 'First visit' : `${ordinal(visit.visitNumber)} visit`}</Badge>}
        {detail && <Badge variant="outline">{detail.isCustomer ? 'Registered customer' : 'Not yet a customer'}</Badge>}
        {visit.converted && <Badge className="bg-status-in-stock text-white">Converted</Badge>}
        {!visit.hasWalkin && <Badge variant="destructive">No walk-in recorded</Badge>}
      </div>

      {visit.activities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
          <span>Activity that day:</span>
          {visit.activities.map((a) => <Badge key={a} variant="outline">{a}</Badge>)}
        </div>
      )}

      <Line icon={UserRound}>{detail?.jc ? `JC: ${detail.jc}` : null}</Line>
      <Line icon={Megaphone}>{visit.sourceName ? `Source: ${visit.sourceName}` : null}</Line>
      <Line icon={Gem}>{visit.interests ? `Interest: ${visit.interests}` : null}</Line>
      <Line icon={Wallet}>{formatAmountOrNull(detail?.budget) ? `Budget: ${formatAmountOrNull(detail.budget)}` : null}</Line>
      <Line icon={StickyNote}>{visit.notes || detail?.notes}</Line>
      <Line icon={ClipboardPen}>{record?.recordedBy ? `Recorded by ${record.recordedBy}` : null}</Line>

      <div className="flex justify-end pt-1">
        <TakeFeedbackButton mobile={visit.mobile} name={visit.customerName} size="sm" className="h-9" />
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-full" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72 overflow-y-auto">
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function WalkInsPage() {
  const companyId   = useSelector(selectActiveStoreId);
  const companyName = useSelector(selectActiveStoreName);

  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [purposeFilter, setPurposeFilter] = useState(ALL);
  const [jcFilter, setJcFilter] = useState(ALL);
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [showSystemVisits, setShowSystemVisits] = useState(false);
  const [activityFilter, setActivityFilter] = useState(ALL);
  const [outcomeFilter, setOutcomeFilter] = useState(ALL);

  const { visits, isLoading, isError, refetch } = useCrmVisits(companyId);
  const { sources } = useSources();
  const { data: categories = [] } = useCategories();

  // Purpose and who recorded it (POS DB), matched to OrnaVerse's visit by mobile + day.
  const { data: recordByVisit = new Map() } = useQuery({
    queryKey: ['walkin-purposes', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await fetch(`/api/walkins/visits?company_id=${companyId}`);
      const rows = res.ok ? (await res.json()).visits ?? [] : [];
      return new Map(rows.map((r) => [visitKey(r.mobileKey, r.recordedAt), r]));
    },
  });

  // One card per customer per day: the walk-in itself, plus whatever OrnaVerse logged for them that day (Order, Sales…).
  const dayGroups = useMemo(() => {
    const groups = new Map();
    for (const v of visits) {
      const key = `${v.leadId ?? last4(v.mobile)}|${v.visitedAt ? new Date(v.visitedAt).toDateString() : v.visitId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(v);
    }
    return [...groups.values()].map((group) => {
      const walkin = group.find(isStoreWalkin);
      const activities = [...new Set(group.filter((v) => !isStoreWalkin(v)).map((v) => v.source))];
      return {
        ...(walkin ?? group[0]),
        hasWalkin: !!walkin,
        activities,
        converted: activities.some((a) => CONVERTING.includes(a)),
      };
    });
  }, [visits]);
  const storeVisits = useMemo(() => dayGroups.filter((g) => g.hasWalkin || showSystemVisits), [dayGroups, showSystemVisits]);
  const leadIds = useMemo(() => [...new Set(storeVisits.map((v) => v.leadId).filter((id) => id != null))].sort(), [storeVisits]);

  // JC, source, interest and budget live once on the customer record in OrnaVerse.
  const { data: details = {} } = useQuery({
    queryKey: ['walkin-details', companyId, leadIds.join(',')],
    enabled: leadIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch('/api/walkins/details', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: leadIds }) });
      return res.ok ? (await res.json()).details ?? {} : {};
    },
  });

  const enriched = useMemo(() => {
    const sourceNames = new Map(sources.map((s) => [s.source_id ?? s.id, s.source_name ?? s.name]));
    const typeNames = new Map(categories.map((c) => [c.type_id, c.type_name]));
    const seen = new Map();
    const numbers = new Map();
    for (const v of [...dayGroups].filter((g) => g.hasWalkin).reverse()) {
      const key = v.leadId ?? last4(v.mobile);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      numbers.set(v.visitId, seen.get(key));
    }
    return storeVisits.map((v) => {
      const detail = details[v.leadId] ?? null;
      return {
        ...v,
        detail,
        record: recordByVisit.get(visitKey(v.mobile, v.visitedAt)) ?? null,
        visitNumber: numbers.get(v.visitId) ?? null,
        sourceName: detail?.sourceId ? sourceNames.get(detail.sourceId) ?? null : null,
        interests: (detail?.interestTypeIds ?? []).map((id) => typeNames.get(id)).filter(Boolean).join(', ') || null,
      };
    });
  }, [storeVisits, dayGroups, details, recordByVisit, sources, categories]);

  const jcOptions = useMemo(() => [...new Set(enriched.map((v) => v.detail?.jc).filter(Boolean))].sort(), [enriched]);
  const activityOptions = useMemo(() => [...new Set(enriched.flatMap((v) => v.activities))].sort(), [enriched]);
  const sourceOptions = useMemo(() => [...new Set(enriched.map((v) => v.sourceName).filter(Boolean))].sort(), [enriched]);

  const term = search.trim().toLowerCase();
  const filtered = enriched.filter((v) => {
    const day = v.visitedAt?.slice(0, 10);
    if (fromDate && (!day || day < fromDate)) return false;
    if (toDate && (!day || day > toDate)) return false;
    if (purposeFilter === NOT_RECORDED ? !!v.record : purposeFilter !== ALL && v.record?.purpose !== purposeFilter) return false;
    if (jcFilter !== ALL && v.detail?.jc !== jcFilter) return false;
    if (sourceFilter !== ALL && v.sourceName !== sourceFilter) return false;
    if (activityFilter !== ALL && !v.activities.includes(activityFilter)) return false;
    if (outcomeFilter !== ALL && (outcomeFilter === 'converted') !== v.converted) return false;
    if (term && !(v.customerName?.toLowerCase().includes(term) || String(v.mobile ?? '').includes(term))) return false;
    return true;
  });

  const hasFilters = !!fromDate || !!toDate || purposeFilter !== ALL || jcFilter !== ALL || sourceFilter !== ALL
    || activityFilter !== ALL || outcomeFilter !== ALL || showSystemVisits;
  const clearFilters = () => {
    setFromDate(''); setToDate(''); setPurposeFilter(ALL); setJcFilter(ALL); setSourceFilter(ALL);
    setActivityFilter(ALL); setOutcomeFilter(ALL); setShowSystemVisits(false);
  };

  const firstVisits = filtered.filter((v) => v.visitNumber === 1).length;
  const purposeCounts = filtered.reduce((m, v) => (v.record?.purpose ? m.set(v.record.purpose, (m.get(v.record.purpose) ?? 0) + 1) : m), new Map());
  const convertedCount = filtered.filter((v) => v.converted).length;
  const topPurpose = [...purposeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex flex-col gap-4 w-full p-4 pb-28 md:p-6 md:pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Walk-ins</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {companyName ? `Logged for ${companyName}` : 'Logged for the active store'}
          </p>
        </div>
        <Button type="button" onClick={() => setIsRegisterOpen(true)} className="gap-1.5 shrink-0">
          <UserPlus size={16} aria-hidden="true" />
          Register Walk-in
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            inputMode="search"
            placeholder="Search by name or mobile number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full pl-9 pr-9"
            aria-label="Search walk-ins"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
        <Button type="button" variant="outline" onClick={() => setIsFilterOpen(true)} className="h-11 gap-2 shrink-0">
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Filters</span>
          {hasFilters && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
        </Button>
      </div>

      {!isLoading && !isError && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Walk-ins', filtered.length],
            ['First visits', firstVisits],
            ['Converted (Order / Sales)', convertedCount],
            ['Top purpose', topPurpose ? `${topPurpose[0]} (${topPurpose[1]})` : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold text-foreground truncate">{value}</p>
            </div>
          ))}
        </div>
      )}

      <ErrorBoundary resetKey="visits" fallbackTitle="Could not display the visit log.">
        <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {isLoading ? (
            <InlineLoader label="Loading visits…" />
          ) : isError ? (
            <ErrorState title="Failed to load the visit log." onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              className="col-span-full"
              icon={Footprints}
              title={hasFilters || term ? 'No walk-ins match these filters.' : 'No walk-ins logged for this store yet.'}
            />
          ) : (
            filtered.map((visit) => <VisitCard key={visit.visitId} visit={visit} />)
          )}
        </StaggerList>
      </ErrorBoundary>

      <BottomSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Filters"
        footerClassName="p-0"
        footer={
          <div className="flex items-stretch">
            <Button type="button" variant="outline" className="min-h-14 flex-1 rounded-none" onClick={clearFilters}>Clear All</Button>
            <Button type="button" className="min-h-14 flex-1 rounded-none" onClick={() => setIsFilterOpen(false)}>Apply Filters</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Visit date</span>
            <div className="flex items-center gap-2">
              <Input type="date" value={fromDate} max={toDate || todayDateString()} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" className="h-11 flex-1 min-w-0" />
              <span className="text-muted-foreground text-sm shrink-0">to</span>
              <Input type="date" value={toDate} min={fromDate || undefined} max={todayDateString()} onChange={(e) => setToDate(e.target.value)} aria-label="To date" className="h-11 flex-1 min-w-0" />
            </div>
          </div>
          <FilterSelect
            label="Purpose"
            value={purposeFilter}
            onChange={setPurposeFilter}
            options={[{ value: ALL, label: 'Any purpose' }, ...WALKIN_PURPOSES.map((p) => ({ value: p, label: p })), { value: NOT_RECORDED, label: 'Not recorded' }]}
          />
          <FilterSelect
            label="Jewelry Consultant"
            value={jcFilter}
            onChange={setJcFilter}
            options={[{ value: ALL, label: 'All consultants' }, ...jcOptions.map((n) => ({ value: n, label: n }))]}
          />
          <FilterSelect
            label="Source"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[{ value: ALL, label: 'All sources' }, ...sourceOptions.map((n) => ({ value: n, label: n }))]}
          />
          <FilterSelect
            label="Activity that day"
            value={activityFilter}
            onChange={setActivityFilter}
            options={[{ value: ALL, label: 'Any activity' }, ...activityOptions.map((n) => ({ value: n, label: n }))]}
          />
          <FilterSelect
            label="Outcome"
            value={outcomeFilter}
            onChange={setOutcomeFilter}
            options={[{ value: ALL, label: 'Any outcome' }, { value: 'converted', label: 'Converted (Order / Sales)' }, { value: 'open', label: 'Not converted' }]}
          />
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
            <input type="checkbox" checked={showSystemVisits} onChange={(e) => setShowSystemVisits(e.target.checked)} className="h-4 w-4 accent-primary" />
            Include days with OrnaVerse activity but no walk-in recorded
          </label>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} title="Register Walk-in">
        <WalkInRegisterForm onRegistered={() => setIsRegisterOpen(false)} />
      </BottomSheet>
    </div>
  );
}
