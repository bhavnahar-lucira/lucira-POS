'use client';

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { useZohoDeals } from '@/hooks/admin/useZohoDeals';
import DealsSummaryCards from '@/components/features/deals/DealsSummaryCards';
import DealDetailSheet from '@/components/features/deals/DealDetailSheet';
import PhoneLink from '@/components/shared/PhoneLink';
import EmptyState from '@/components/shared/EmptyState';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatAmountOrDash as formatCurrency } from '@/lib/priceUtils';
import { formatDateNumeric, formatDateTime, todayDateString } from '@/lib/dateUtils';
import {
  Search,
  RefreshCw,
  Target,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  Filter,
  Sparkles,
  Store,
  Compass,
  Coins,
  CalendarCheck,
  Calendar,
  Gift,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function StageBadge({ stage }) {
  if (!stage) return null;
  const s = stage.toLowerCase();
  let color = 'bg-muted text-muted-foreground border-border';

  if (s.includes('won') || s.includes('converted')) {
    color = 'bg-status-in-stock/10 text-status-in-stock border-status-in-stock/20';
  } else if (s.includes('lost') || s.includes('junk') || s.includes('not interested')) {
    color = 'bg-destructive/10 text-destructive border-destructive/20';
  } else if (s.includes('negotiation') || s.includes('proposal') || s.includes('decision')) {
    color = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  } else if (s.includes('qualif') || s.includes('contact') || s.includes('lead') || s.includes('new')) {
    color = 'bg-primary/10 text-primary border-primary/20';
  }

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', color)}>
      {stage}
    </span>
  );
}

function DealScorePill({ score }) {
  if (score == null) return <span className="text-muted-foreground text-xs">—</span>;
  let color = 'text-muted-foreground';
  if (score >= 70) color = 'text-status-in-stock font-bold';
  else if (score >= 40) color = 'text-amber-600 dark:text-amber-400 font-medium';

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs tabular-nums', color)}>
      <Sparkles size={10} aria-hidden="true" />
      {score}
    </span>
  );
}

export default function DealsPage() {
  const isSuperAdmin = useSelector(selectIsSuperAdmin);

  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Debounce search input to avoid hitting Zoho repeatedly
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleStoreChange = (val) => {
    setStoreFilter(val);
    setPage(1);
  };

  const handleStageChange = (val) => {
    setStageFilter(val);
    setPage(1);
  };

  const handleTabChange = (val) => {
    setActiveTab(val);
    setPage(1);
  };

  const handleDatePresetChange = (preset) => {
    setDatePreset(preset);
    setPage(1);
    const today = todayDateString();

    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (preset === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setFromDate(yStr);
      setToDate(yStr);
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const fromStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setFromDate(fromStr);
      setToDate(today);
    } else if (preset === 'thisMonth') {
      const d = new Date();
      const fromStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      setFromDate(fromStr);
      setToDate(today);
    } else if (preset === 'lastMonth') {
      const d = new Date();
      const prevMonthLastDay = new Date(d.getFullYear(), d.getMonth(), 0);
      const fromStr = `${prevMonthLastDay.getFullYear()}-${String(prevMonthLastDay.getMonth() + 1).padStart(2, '0')}-01`;
      const toStr = `${prevMonthLastDay.getFullYear()}-${String(prevMonthLastDay.getMonth() + 1).padStart(2, '0')}-${String(prevMonthLastDay.getDate()).padStart(2, '0')}`;
      setFromDate(fromStr);
      setToDate(toStr);
    }
  };

  const handleCustomFromDate = (e) => {
    setFromDate(e.target.value);
    setDatePreset('custom');
    setPage(1);
  };

  const handleCustomToDate = (e) => {
    setToDate(e.target.value);
    setDatePreset('custom');
    setPage(1);
  };

  const handleClearDateRange = () => {
    setDatePreset('all');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useZohoDeals(
    {
      page,
      perPage,
      store: storeFilter,
      stage: stageFilter,
      search: debouncedSearch,
      fromDate,
      toDate,
    },
    { enabled: isSuperAdmin }
  );

  const handleRetry = async () => {
    if (cooldownSeconds > 0) return;
    const res = await refetch();
    if (res?.error) {
      const msg = (res.error?.response?.data?.error || res.error?.message || '').toLowerCase();
      if (msg.includes('rate limit') || msg.includes('cooling down') || msg.includes('too many requests')) {
        setCooldownSeconds(60);
      }
    }
  };

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Security gate: non-super-admins cannot view or interact with this page
  if (!isSuperAdmin) {
    return (
      <div className="flex h-[75vh] flex-col items-center justify-center p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
          <ShieldAlert size={28} aria-hidden="true" />
        </div>
        <h2 className="font-heading text-xl font-bold text-foreground">Access Restricted</h2>
        <p className="max-w-md text-sm text-muted-foreground mt-1.5 leading-relaxed">
          The Zoho CRM Deals and marketing attribution module is strictly restricted to Super Admin accounts.
        </p>
      </div>
    );
  }

  const rawDeals = data?.deals ?? [];
  const summary = data?.summary ?? {};
  const info = data?.info ?? { page: 1, per_page: perPage, count: 0, more_records: false };
  const availableStores = summary?.stores ?? [];
  const availableStages = summary?.stages ?? [];

  // Filter deals based on active category tab
  const displayedDeals = rawDeals.filter((deal) => {
    if (activeTab === 'store') {
      return !!deal.storeAssigned;
    }
    if (activeTab === 'online') {
      return (
        deal.dealTriggerEvent?.toLowerCase() === 'signup' ||
        deal.utmSource?.toLowerCase().includes('shopify') ||
        deal.leadSource?.toLowerCase() === 'website'
      );
    }
    if (activeTab === 'campaigns') {
      return (
        !!deal.purchaseReason ||
        (deal.leadSource && deal.leadSource.toLowerCase() !== 'website') ||
        !!deal.utmCampaign ||
        !!deal.appointmentDateTime
      );
    }
    return true; // 'all'
  });

  const storeCount = rawDeals.filter((d) => !!d.storeAssigned).length;

  const onlineCount = rawDeals.filter(
    (d) =>
      d.dealTriggerEvent?.toLowerCase() === 'signup' ||
      d.utmSource?.toLowerCase().includes('shopify') ||
      d.leadSource?.toLowerCase() === 'website'
  ).length;

  const campaignsCount = rawDeals.filter(
    (d) =>
      !!d.purchaseReason ||
      (d.leadSource && d.leadSource.toLowerCase() !== 'website') ||
      !!d.utmCampaign ||
      !!d.appointmentDateTime
  ).length;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-foreground tracking-tight">CRM Deals & Leads</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Super Admin
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Zoho CRM pipeline, jewelry clienteling, ad attribution, and physical store routing.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading || isFetching}
          className="self-start sm:self-auto h-9 gap-1.5"
        >
          <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} aria-hidden="true" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <DealsSummaryCards summary={summary} isLoading={isLoading} />

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-11 p-1 bg-muted/80 rounded-xl">
          <TabsTrigger value="all" className="text-xs sm:text-sm font-medium py-2">
            All Pipeline ({rawDeals.length})
          </TabsTrigger>
          <TabsTrigger value="store" className="text-xs sm:text-sm font-medium py-2 gap-1.5">
            <Store size={14} />
            <span>Store Assigned ({storeCount})</span>
          </TabsTrigger>
          <TabsTrigger value="online" className="text-xs sm:text-sm font-medium py-2 gap-1.5">
            <Compass size={14} />
            <span>Website Signups ({onlineCount})</span>
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="text-xs sm:text-sm font-medium py-2 gap-1.5">
            <Gift size={14} />
            <span>Campaigns & Milestones ({campaignsCount})</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="Search deals by customer, mobile, store, UTM campaign, or event…"
            className="pl-8 h-10 w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Filter Preset */}
          <Select value={datePreset} onValueChange={handleDatePresetChange}>
            <SelectTrigger className="h-10 w-[140px]">
              <Calendar size={14} className="text-muted-foreground mr-1.5 shrink-0" />
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {/* Custom Date Inputs */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border">
              <Input
                type="date"
                value={fromDate}
                max={todayDateString()}
                onChange={handleCustomFromDate}
                className="h-8 w-[125px] text-xs px-2"
                aria-label="From Date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={toDate}
                max={todayDateString()}
                onChange={handleCustomToDate}
                className="h-8 w-[125px] text-xs px-2"
                aria-label="To Date"
              />
            </div>
          )}

          {/* Clear Date Filter Button */}
          {(fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearDateRange}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              title="Clear date filter"
            >
              <X size={13} />
              <span>Clear Date</span>
            </Button>
          )}

          {/* Store Filter */}
          <Select value={storeFilter} onValueChange={handleStoreChange}>
            <SelectTrigger className="h-10 w-[160px]">
              <Store size={14} className="text-muted-foreground mr-1.5 shrink-0" />
              <SelectValue placeholder="All Stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {availableStores.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name} ({s.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stage Filter */}
          <Select value={stageFilter} onValueChange={handleStageChange}>
            <SelectTrigger className="h-10 w-[160px]">
              <Filter size={14} className="text-muted-foreground mr-1.5 shrink-0" />
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {availableStages.map((st) => (
                <SelectItem key={st.name} value={st.name}>
                  {st.name} ({st.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Deals Table Content */}
      {isLoading ? (
        <ListRowsSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-destructive/20 bg-destructive/5 max-w-2xl mx-auto w-full">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
            <ShieldAlert size={24} />
          </div>
          <p className="text-base font-semibold text-destructive">Could not load Zoho CRM Deals</p>
          <p className="text-sm text-foreground/80 mt-2 max-w-md font-medium">
            {error?.response?.data?.error || error?.message || 'Check Zoho CRM credentials and connection.'}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-md">
            If rate-limited by Zoho, please pause for 60 seconds before retrying to allow the token refresh quota to reset.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isFetching || cooldownSeconds > 0}
            className="mt-4 h-9 gap-1.5 min-w-[130px]"
          >
            <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
            <span>
              {isFetching
                ? 'Connecting to Zoho…'
                : cooldownSeconds > 0
                ? `Retry in ${cooldownSeconds}s`
                : 'Try Again'}
            </span>
          </Button>
        </div>
      ) : displayedDeals.length === 0 ? (
        <div className="flex flex-col gap-3">
          <EmptyState
            icon={Target}
            title="No records found in this view"
            description={
              (page > 1 || info.more_records) && (storeFilter !== 'all' || stageFilter !== 'all' || activeTab !== 'all')
                ? `Nothing on page ${page} matches — store, stage and category filters apply one page of Zoho results at a time, so check the other pages.`
                : search || storeFilter !== 'all' || stageFilter !== 'all'
                ? 'Try modifying your search query or filters.'
                : activeTab !== 'all'
                ? `No records currently match the ${activeTab} category.`
                : 'No deals recorded in Zoho CRM yet.'
            }
          />
          {(page > 1 || info.more_records) && (
            <div className="flex items-center justify-center gap-2 text-xs">
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft size={13} /> Previous
              </Button>
              <span className="px-2 font-medium text-foreground">Page {page}</span>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={!info.more_records || isFetching} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight size={13} />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Customer & Intent</th>
                  <th className="px-3 py-3">Stage & Status</th>
                  <th className="px-3 py-3">Score</th>
                  <th className="px-3 py-3 text-right">Amount / Scheme</th>
                  <th className="px-3 py-3">Store Assigned</th>
                  <th className="px-3 py-3">UTM Campaign / Source</th>
                  <th className="px-3 py-3 text-right">Date</th>
                  <th className="px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayedDeals.map((deal) => (
                  <tr
                    key={deal.id}
                    onClick={() => setSelectedDeal(deal)}
                    className="hover:bg-muted/50 transition-colors cursor-pointer group"
                  >
                    {/* Deal Name & Customer */}
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {deal.contactName || deal.dealName}
                        </p>
                        {deal.purchaseReason && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-medium text-primary">
                            <Gift size={9} />
                            {deal.purchaseReason}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        {deal.mobile && (
                          <PhoneLink phone={deal.mobile} className="text-xs" />
                        )}
                        {deal.email && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[150px]">{deal.email}</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Stage & Intent */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <StageBadge stage={deal.stage} />
                        {deal.intentStage && (
                          <span className="text-[11px] text-muted-foreground">
                            {deal.intentStage}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Deal Score */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <DealScorePill score={deal.dealScore} />
                    </td>

                    {/* Amount / Scheme Value */}
                    <td className="px-3 py-3 text-right font-bold text-foreground tabular-nums whitespace-nowrap">
                      {deal.amount > 0 ? (
                        formatCurrency(deal.amount)
                      ) : deal.schemeMonthlyAmount ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          <Coins size={11} />
                          ₹{deal.schemeMonthlyAmount.toLocaleString('en-IN')}/mo
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-normal text-xs">—</span>
                      )}
                    </td>

                    {/* Store Assigned */}
                    <td className="px-3 py-3 whitespace-nowrap text-xs">
                      {deal.storeAssigned ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <Store size={12} className="text-muted-foreground" aria-hidden="true" />
                            {deal.storeAssigned}
                          </span>
                          {deal.storeExecutive && (
                            <span className="text-[11px] text-muted-foreground">
                              Exec: {deal.storeExecutive}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">Unassigned</span>
                          {deal.dealOwner && (
                            <span className="text-[11px] text-muted-foreground">Owner: {deal.dealOwner}</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* UTM Source / Campaign */}
                    <td className="px-3 py-3 max-w-[150px] truncate text-xs">
                      {deal.utmCampaign || deal.utmSource ? (
                        <div className="flex flex-col gap-0.5 truncate">
                          <span className="inline-flex items-center gap-1 text-foreground/80 font-medium truncate" title={`${deal.utmSource} / ${deal.utmCampaign}`}>
                            <Compass size={11} className="text-amber-500 shrink-0" aria-hidden="true" />
                            <span className="truncate">{deal.utmCampaign || deal.utmSource}</span>
                          </span>
                          {deal.dealTriggerEvent && (
                            <span className="text-[10px] text-muted-foreground capitalize">
                              Event: {deal.dealTriggerEvent}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-3 py-3 text-right whitespace-nowrap text-xs text-muted-foreground">
                      {deal.createdTime ? formatDateNumeric(deal.createdTime) : '—'}
                    </td>

                    {/* Action Arrow */}
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground group-hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDeal(deal);
                        }}
                        aria-label={`View details for ${deal.dealName}`}
                      >
                        <ChevronRight size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Page-Wise Pagination Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>
                Showing <strong className="text-foreground">{displayedDeals.length}</strong> records on Page{' '}
                <strong className="text-foreground">{page}</strong>
              </span>

              {/* Per Page Select */}
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Per page:</span>
                <Select
                  value={String(perPage)}
                  onValueChange={(val) => {
                    setPerPage(Number(val));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-7 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Page navigation buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="h-8 gap-1 text-xs"
              >
                <ChevronLeft size={13} />
                <span>Previous</span>
              </Button>

              <span className="px-2 font-medium text-foreground">Page {page}</span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!info.more_records || isFetching}
                className="h-8 gap-1 text-xs"
              >
                <span>Next</span>
                <ChevronRight size={13} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Slide-over Sheet (Tab-Wise View) */}
      <DealDetailSheet
        deal={selectedDeal}
        isOpen={!!selectedDeal}
        onClose={() => setSelectedDeal(null)}
      />
    </div>
  );
}
