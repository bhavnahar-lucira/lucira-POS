'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { ChevronLeft, ChevronRight, ExternalLink, Headphones, RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BottomSheet from '@/components/shared/BottomSheet';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import PillTabs from '@/components/shared/PillTabs';
import { StaggerList } from '@/components/shared/StaggerList';
import { DocumentSearchInput, ListFiltersHeader, ListMobileFilterBar } from '@/components/shared/DocumentListFilters';
import CallDetailSheet, { resolveAgentInfo, callStatusTone } from '@/components/features/frejun/CallDetailSheet';
import { isIncomingCall, resolveAllAgents } from '@/lib/frejun/agentInfo';
import CallListItem from '@/components/features/frejun/CallListItem';
import StaffAnalyticsPanel from '@/components/features/frejun/StaffAnalyticsPanel';
import AgentOverviewPanel from '@/components/features/frejun/AgentOverviewPanel';
import { useFrejunCalls } from '@/hooks/frejun/useFrejunCalls';
import { useFrejunAnalytics } from '@/hooks/frejun/useFrejunAnalytics';
import { useFrejunAgents } from '@/hooks/frejun/useFrejunAgents';
import { selectActiveStoreName, selectActiveStoreCode } from '@/store/slices/storeSlice';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { matchStoreByNameOrCode } from '@/lib/frejun/storeMapping';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString } from '@/lib/dateUtils';

const ALL = 'all';

const STORE_TAG_OPTIONS = [
  { value: ALL, label: 'All stores' },
  { value: 'borivali', label: 'Borivali Store', email: 'lcmbombor@lucirajewelry.com' },
  { value: 'chembur', label: 'Chembur Store', email: 'lcsbomchb@lucirajewelry.com' },
  { value: 'pune', label: 'Pune Store', email: 'lcspnqjmr@lucirajewelry.com' },
  { value: 'lajpat', label: 'Lajpat Nagar Store', email: 'lcsdelljn@lucirajewelry.com' },
  { value: 'paschim', label: 'Paschim Vihar Store', email: 'lcsdelpvh@lucirajewelry.com' },
  { value: 'noida', label: 'Noida Store', email: 'lcnois18@lucirajewelry.com' },
  { value: 'malleshwaram', label: 'Malleshwaram Store', email: 'lcsblrmal@lucirajewelry.com' },
  { value: 'kondapur', label: 'Hyderabad Kondapur', email: 'ljhydkdp@lucirajewelry.com' },
  { value: 'somajiguda', label: 'Hyderabad Somajiguda', email: 'ljhydsmj@lucirajewelry.com' },
  { value: 'hsr', label: 'Bangalore HSR', email: 'ljblrhsr@lucirajewelry.com' },
  { value: 'jayanagar', label: 'Bangalore Jayanagar', email: 'ljblrjyn@lucirajewelry.com' },
];

const CALLS_REFRESH_MS = 30 * 1000;
const TOTALS_REFRESH_MS = 60 * 1000;

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7days', label: 'Last 7 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: '30days', label: 'Last 30 days' },
  { value: 'all', label: 'Last 90 days' },
];

const DIRECTION_OPTIONS = [
  { value: 'outgoing', label: 'Outgoing' },
  { value: 'incoming', label: 'Incoming' },
];

const STATUS_OPTIONS = [
  { value: 'answered', label: 'Answered' },
  { value: 'missed', label: 'Not answered / missed' },
  { value: 'ongoing', label: 'Ongoing' },
];

const agentNameFromEmail = (email) => email.split('@')[0].split(/[._]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function calculatePresetDates(presetKey) {
  const today = todayDateString();
  const d = new Date();
  switch (presetKey) {
    case 'yesterday':
      d.setDate(d.getDate() - 1);
      return [isoDay(d), isoDay(d)];
    case '7days':
      d.setDate(d.getDate() - 6);
      return [isoDay(d), today];
    case 'thisMonth':
      return [`${today.slice(0, 8)}01`, today];
    case '30days':
      d.setDate(d.getDate() - 30);
      return [isoDay(d), today];
    case 'all':
      d.setDate(d.getDate() - 90);
      return [isoDay(d), today];
    default:
      return [today, today];
  }
}

const DEFAULT_PRESET = '7days';

function DateRangeControls({ preset, fromDate, toDate, onPreset, onCustom, compact = false }) {
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);

  const applyIfValid = (from, to) => {
    if (from && to && from <= to && (from !== fromDate || to !== toDate)) onCustom(from, to);
  };
  const inputClass = compact ? 'h-10 w-[9.5rem]' : 'h-11 flex-1 min-w-0';

  return (
    <div className={compact ? 'flex items-center gap-2' : 'flex flex-col gap-2'}>
      <Select value={preset} onValueChange={onPreset}>
        <SelectTrigger className={compact ? 'h-10 w-40' : 'h-11 w-full'} aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          {preset === 'custom' && <SelectItem value="custom">Custom range</SelectItem>}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Input
          type="date" value={draftFrom} max={draftTo || todayDateString()} aria-label="From date" className={inputClass}
          onChange={(e) => { setDraftFrom(e.target.value); applyIfValid(e.target.value, draftTo); }}
        />
        <span className="text-muted-foreground text-sm shrink-0">to</span>
        <Input
          type="date" value={draftTo} min={draftFrom || undefined} max={todayDateString()} aria-label="To date" className={inputClass}
          onChange={(e) => { setDraftTo(e.target.value); applyIfValid(draftFrom, e.target.value); }}
        />
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, allLabel }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">{label}</h3>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" className="max-h-72">
          {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </section>
  );
}

export default function FrejunTelephonyPage() {
  const activeStoreName = useSelector(selectActiveStoreName);
  const activeStoreCode = useSelector(selectActiveStoreCode);
  const matchedActiveStore = useMemo(
    () => matchStoreByNameOrCode(activeStoreName || activeStoreCode),
    [activeStoreName, activeStoreCode],
  );
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const defaultStore = matchedActiveStore?.key ?? ALL;
  const storeOptions = isSuperAdmin
    ? STORE_TAG_OPTIONS
    : STORE_TAG_OPTIONS.filter((o) => o.value === matchedActiveStore?.key);
  const isStoreUnmapped = !isSuperAdmin && !matchedActiveStore;

  const [activeTab, setActiveTab] = useState('calls');
  const [datePreset, setDatePreset] = useState(DEFAULT_PRESET);
  const [fromDate, setFromDate] = useState(() => calculatePresetDates(DEFAULT_PRESET)[0]);
  const [toDate, setToDate] = useState(() => calculatePresetDates(DEFAULT_PRESET)[1]);
  const [selectedStoreTag, setSelectedStoreTag] = useState(defaultStore);
  const userHasPickedStoreRef = useRef(false);

  useEffect(() => {
    if (!userHasPickedStoreRef.current && matchedActiveStore) setSelectedStoreTag(matchedActiveStore.key);
  }, [matchedActiveStore]);

  const [inputVal, setInputVal] = useState('');
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState(ALL);
  const [callType, setCallType] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Ranges that include today keep changing, so they refresh on their own (paused while the tab is hidden).
  const isLiveRange = !toDate || toDate >= todayDateString();

  const resolvedFilter = useMemo(() => {
    const storeOption = STORE_TAG_OPTIONS.find((s) => s.value === selectedStoreTag);
    let email = '';
    let tag = '';
    let storeKey = '';
    if (storeOption && storeOption.value !== ALL) {
      if (storeOption.email) email = storeOption.email;
      storeKey = storeOption.value;
    }
    if (selectedAgent !== ALL) {
      if (selectedAgent.includes('@')) email = selectedAgent;
      else tag = selectedAgent;
    }
    return { email, tag, storeKey };
  }, [selectedStoreTag, selectedAgent]);

  const {
    calls, count, pageCount, totalPages, hasNext, hasPrevious,
    isLoading: isCallsLoading, isFetching: isCallsFetching, isError: isCallsError, error: callsError,
    refetch: refetchCalls, updatedAt: callsUpdatedAt,
  } = useFrejunCalls({
    page,
    pageSize,
    search,
    userEmail: resolvedFilter.email,
    store: resolvedFilter.storeKey,
    tag: resolvedFilter.tag,
    dateStart: fromDate,
    dateEnd: toDate,
  }, { refetchInterval: isLiveRange ? CALLS_REFRESH_MS : false });

  const { calls: unfilteredCalls } = useFrejunCalls({
    page: 1,
    pageSize: 100,
    store: resolvedFilter.storeKey,
    userEmail: STORE_TAG_OPTIONS.find((s) => s.value === selectedStoreTag)?.email ?? '',
    dateStart: fromDate,
    dateEnd: toDate,
  }, { refetchInterval: isLiveRange ? TOTALS_REFRESH_MS : false });

  const {
    analytics, isLoading: isAnalyticsLoading, isFetching: isAnalyticsFetching, refetch: refetchAnalytics, updatedAt: analyticsUpdatedAt,
  } = useFrejunAnalytics({
    dateStart: fromDate || calculatePresetDates('thisMonth')[0],
    dateEnd: toDate || todayDateString(),
    users: resolvedFilter.email,
  }, { refetchInterval: isLiveRange ? TOTALS_REFRESH_MS : false });

  const {
    overview, isLoading: isAgentsLoading, isFetching: isAgentsFetching, error: agentsError, refetch: refetchAgents, updatedAt: agentsUpdatedAt,
  } = useFrejunAgents(
    { store: selectedStoreTag, dateStart: fromDate, dateEnd: toDate },
    { enabled: activeTab === 'agents' && !isStoreUnmapped, refetchInterval: isLiveRange ? TOTALS_REFRESH_MS : false },
  );

  const displayedCalls = useMemo(() => calls.filter((c) => {
    if (callType !== ALL) {
      if (callType === 'incoming' && !isIncomingCall(c.call_type)) return false;
      if (callType === 'outgoing' && isIncomingCall(c.call_type)) return false;
    }
    if (statusFilter !== ALL) {
      const tone = callStatusTone(c.status);
      if (statusFilter === 'answered' && tone !== 'done') return false;
      if (statusFilter === 'missed' && tone !== 'error') return false;
      if (statusFilter === 'ongoing' && !String(c.status || '').toLowerCase().includes('ongoing')) return false;
    }
    if (selectedAgent !== ALL) {
      const info = resolveAgentInfo(c);
      const q = selectedAgent.toLowerCase();
      const match = info.agentName?.toLowerCase().includes(q) || info.fullTag?.toLowerCase().includes(q) || c.recruiter?.toLowerCase() === q;
      if (!match) return false;
    }
    return true;
  }), [calls, callType, statusFilter, selectedAgent]);

  const isAgentExact = selectedAgent === ALL || selectedAgent.includes('@') || selectedStoreTag !== ALL || !!matchStoreByNameOrCode(selectedAgent);
  const isPostFiltered = callType !== ALL || statusFilter !== ALL || !isAgentExact;

  const agentOptions = useMemo(() => {
    const map = new Map();
    const seenNames = new Set();
    const add = (value, label, name = label) => {
      if (!value || map.has(value) || seenNames.has(name.toLowerCase())) return;
      map.set(value, label);
      seenNames.add(name.toLowerCase());
    };
    for (const a of overview?.agents ?? []) {
      if (!a.untagged) add(a.key, `${a.name} (${overview.store?.label ?? 'store'})`, a.name);
    }
    for (const call of [...unfilteredCalls, ...calls]) {
      for (const info of resolveAllAgents(call)) {
        if (info.tagId) add(info.fullTag, info.storeName ? `${info.agentName} (${info.storeName})` : info.agentName, info.agentName);
        else if (!info.store && call.recruiter?.includes('@')) add(call.recruiter.toLowerCase(), info.agentName);
      }
    }
    if (selectedStoreTag === ALL || selectedStoreTag === 'borivali') {
      for (const name of ['Brandon Parkhe', 'Sarika Adangale', 'Mamta Tambe', 'Sanjay Jaiswal']) add(`Borivali - ${name}`, `${name} (Borivali Store)`, name);
    }
    for (const item of analytics) {
      const email = String(item.user || '').toLowerCase();
      if (email && !matchStoreByNameOrCode(email)) add(email, agentNameFromEmail(email));
    }
    if (selectedAgent !== ALL && !map.has(selectedAgent)) {
      map.set(selectedAgent, selectedAgent.includes('@') ? agentNameFromEmail(selectedAgent) : selectedAgent);
    }
    return Array.from(map.entries())
      .sort((x, y) => x[1].localeCompare(y[1]))
      .map(([value, label]) => ({ value, label }));
  }, [unfilteredCalls, calls, analytics, overview, selectedStoreTag, selectedAgent]);

  const pageStats = useMemo(() => {
    let answered = 0;
    let missed = 0;
    let minutes = 0;
    for (const c of displayedCalls) {
      const tone = callStatusTone(c.status);
      if (tone === 'done') answered++;
      else if (tone === 'error') missed++;
      minutes += Number(c.call_duration) || 0;
    }
    return { answered, missed, minutes: Math.round(minutes) };
  }, [displayedCalls]);

  const resetPage = () => setPage(1);

  const handlePresetSelect = (presetKey) => {
    const [from, to] = calculatePresetDates(presetKey);
    setDatePreset(presetKey);
    setFromDate(from);
    setToDate(to);
    resetPage();
  };

  const handleCustomDateChange = (from, to) => {
    setDatePreset('custom');
    setFromDate(from);
    setToDate(to);
    resetPage();
  };

  const handleStoreSelect = (val) => {
    userHasPickedStoreRef.current = true;
    setSelectedStoreTag(val);
    resetPage();
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(val.trim()); resetPage(); }, val.trim() ? APP_CONFIG.SEARCH.DEBOUNCE_MS : 0);
  };

  const handleClearAll = () => {
    clearTimeout(debounceRef.current);
    setInputVal('');
    setSearch('');
    setSelectedAgent(ALL);
    setCallType(ALL);
    setStatusFilter(ALL);
    setSelectedStoreTag(defaultStore);
    handlePresetSelect(DEFAULT_PRESET);
  };

  const handleRefresh = () => {
    refetchCalls();
    refetchAnalytics();
    if (activeTab === 'agents' && selectedStoreTag !== ALL) refetchAgents();
  };

  const handleSelectStaff = (agentKey) => {
    setSelectedAgent(agentKey);
    setActiveTab('calls');
    resetPage();
  };

  const handleAgentSelect = (v) => { setSelectedAgent(v); resetPage(); };
  const filterCount = [
    isSuperAdmin && selectedStoreTag !== defaultStore,
    callType !== ALL,
    statusFilter !== ALL,
  ].filter(Boolean).length;
  const hasFilters = filterCount > 0 || !!inputVal || datePreset !== DEFAULT_PRESET || selectedAgent !== ALL;
  const agentLabel = selectedAgent === ALL ? null : agentOptions.find((o) => o.value === selectedAgent)?.label ?? selectedAgent;
  const dateControlProps = {
    preset: datePreset, fromDate, toDate, onPreset: handlePresetSelect, onCustom: handleCustomDateChange,
  };

  const searchProps = {
    value: inputVal,
    onChange: handleSearchChange,
    onClear: () => { clearTimeout(debounceRef.current); setInputVal(''); setSearch(''); resetPage(); },
    placeholder: activeTab === 'calls' ? 'Search customer mobile or email' : 'Search agent',
    label: activeTab === 'calls' ? 'Search calls' : 'Search agents',
  };
  const refreshAction = {
    label: 'Refresh', icon: RefreshCw, onClick: handleRefresh, busy: isCallsFetching || isAnalyticsFetching || isAgentsFetching, spinIcon: true,
  };

  const shownUpdatedAt = activeTab === 'calls'
    ? callsUpdatedAt
    : (selectedStoreTag === ALL ? analyticsUpdatedAt : agentsUpdatedAt);

  const storeLabel = STORE_TAG_OPTIONS.find((o) => o.value === selectedStoreTag)?.label ?? 'All stores';
  const dateLabel = datePreset === 'custom'
    ? `${fromDate || '…'} to ${toDate || '…'}`
    : DATE_PRESETS.find((p) => p.value === datePreset)?.label;

  const tabs = [
    { key: 'calls', label: `Calls${count ? ` · ${count.toLocaleString('en-IN')}` : ''}` },
    { key: 'agents', label: 'Agents' },
  ];

  return (
    <div className="flex flex-col gap-3 w-full p-4 pb-28 md:p-6 md:pb-6">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-2 border-b border-border bg-background px-4 pt-4 pb-3 md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
        <ListFiltersHeader
          search={searchProps}
          filterCount={filterCount}
          onOpenFilters={() => setIsFilterOpen(true)}
          action={refreshAction}
          onClearAll={handleClearAll}
          hasFilters={hasFilters}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PillTabs tabs={tabs} value={activeTab} onChange={setActiveTab} className="md:max-w-xs" />
          <div className="hidden md:flex flex-wrap items-center justify-end gap-2">
            <Select value={selectedAgent} onValueChange={handleAgentSelect}>
              <SelectTrigger className="h-10 w-56" aria-label="Calling agent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" className="max-h-72">
                <SelectItem value={ALL}>All agents</SelectItem>
                {agentOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <DateRangeControls key={`${fromDate}|${toDate}`} {...dateControlProps} compact />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-xs text-muted-foreground">
            {storeLabel} · {dateLabel}
            {agentLabel && ` · ${agentLabel}`}
            {filterCount > 0 && ` · ${filterCount} filter${filterCount !== 1 ? 's' : ''}`}
            {shownUpdatedAt > 0 && ` · Updated ${new Date(shownUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            {isLiveRange && ' · live'}
          </p>
          <div className="flex items-center gap-1">
            {hasFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={handleClearAll} className="md:hidden h-8 gap-1">
                <X size={14} aria-hidden="true" />
                Clear
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground">
              <a href="https://product.frejun.com" target="_blank" rel="noopener noreferrer">
                FreJun portal
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      {isStoreUnmapped ? (
        <EmptyState icon={Headphones} title="FreJun isn't set up for this store." description="Ask the admin team to map this store's FreJun account." />
      ) : activeTab === 'calls' ? (
        <>
          {!isCallsLoading && !isCallsError && displayedCalls.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {isPostFiltered
                ? `${displayedCalls.length} matching of ${pageCount} calls on this page · ${count.toLocaleString('en-IN')} before filters`
                : `${count.toLocaleString('en-IN')} calls`}
              {` · This page: ${pageStats.answered} answered, ${pageStats.missed} not answered, ${pageStats.minutes} min talk time`}
            </p>
          )}

          <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
            {isCallsLoading ? (
              <InlineLoader className="col-span-full" label="Loading calls…" />
            ) : isCallsError ? (
              <ErrorState className="col-span-full" title="Couldn't load calls." description={callsError?.message} onRetry={() => refetchCalls()} />
            ) : displayedCalls.length === 0 ? (
              <EmptyState
                className="col-span-full"
                icon={Headphones}
                title={hasFilters ? 'No calls match your filters.' : 'No calls yet.'}
                description={hasFilters
                  ? 'Try another date range or clear the filters.'
                  : 'No calls have been made or received for the selected dates. New calls appear here automatically.'}
              />
            ) : (
              displayedCalls.map((call) => (
                <CallListItem key={call.id || call.call_id} call={call} onSelect={() => setSelectedCall(call)} />
              ))
            )}
          </StaggerList>

          {!isCallsLoading && !isCallsError && totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!hasPrevious || page <= 1 || isCallsFetching}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext || page >= totalPages || isCallsFetching}
                aria-label="Next page"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); resetPage(); }}>
                <SelectTrigger className="h-8 w-auto gap-1 text-xs" aria-label="Calls per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} per page</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      ) : selectedStoreTag === ALL ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            All stores: totals per FreJun login. Pick a store in Filters to see each of its agents.
          </p>
          <StaffAnalyticsPanel analytics={analytics} isLoading={isAnalyticsLoading} search={inputVal} onSelectStaff={handleSelectStaff} />
        </div>
      ) : (
        <AgentOverviewPanel
          overview={overview}
          isLoading={isAgentsLoading}
          error={agentsError}
          search={inputVal}
          onRetry={() => refetchAgents()}
          onSelectAgent={handleSelectStaff}
        />
      )}

      <ListMobileFilterBar hasActiveFilters={hasFilters} onOpenFilters={() => setIsFilterOpen(true)} action={refreshAction} />

      <BottomSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Filters"
        footerClassName="p-0"
        footer={(
          <div className="flex items-stretch">
            <Button type="button" variant="outline" className="min-h-14 flex-1 rounded-none" onClick={handleClearAll}>
              Clear All
            </Button>
            <Button type="button" className="min-h-14 flex-1 rounded-none" onClick={() => setIsFilterOpen(false)}>
              Apply Filters
            </Button>
          </div>
        )}
      >
        <div className="flex flex-col gap-5">
          <div className="md:hidden">
            <DocumentSearchInput {...searchProps} />
          </div>

          {isSuperAdmin ? (
            <FilterSelect label="Store" value={selectedStoreTag} onChange={handleStoreSelect} options={storeOptions} />
          ) : (
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-foreground">Store</h3>
              <p className="text-sm text-muted-foreground">{storeOptions[0]?.label ?? 'Not set up for FreJun'}</p>
            </section>
          )}

          <section className="flex flex-col gap-2 md:hidden">
            <h3 className="text-sm font-medium text-foreground">Date</h3>
            <DateRangeControls key={`${fromDate}|${toDate}`} {...dateControlProps} />
          </section>

          <div className="md:hidden">
            <FilterSelect label="Calling agent" value={selectedAgent} onChange={handleAgentSelect} options={agentOptions} allLabel="All agents" />
          </div>
          <FilterSelect label="Direction" value={callType} onChange={setCallType} options={DIRECTION_OPTIONS} allLabel="All directions" />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} allLabel="All statuses" />
        </div>
      </BottomSheet>

      <CallDetailSheet call={selectedCall} isOpen={!!selectedCall} onClose={() => setSelectedCall(null)} />
    </div>
  );
}
