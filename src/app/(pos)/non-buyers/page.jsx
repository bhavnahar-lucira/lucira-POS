'use client';

import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Search, X, Loader2, RefreshCw, UserX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import BottomSheet from '@/components/shared/BottomSheet';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import { StaggerList } from '@/components/shared/StaggerList';
import BuyersMobileFilterBar from '@/components/features/buyers/BuyersMobileFilterBar';
import NonBuyerListItem from '@/components/features/nonBuyers/NonBuyerListItem';
import NonBuyerDetailSheet from '@/components/features/nonBuyers/NonBuyerDetailSheet';
import { useNonBuyers } from '@/hooks/customer/useNonBuyers';
import { selectActiveStoreId, selectActiveStoreName, selectAvailableStores } from '@/store/slices/storeSlice';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { todayDateString } from '@/lib/dateUtils';
import APP_CONFIG from '@/constants/appConfig';

// Default look-back: recent enough that a follow-up call still makes sense.
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_MIN_VISITS = '2';
const DEFAULT_SORT = 'visits';

const MIN_VISIT_OPTIONS = [
  { value: '1', label: '1+ visits' },
  { value: '2', label: '2+ visits' },
  { value: '3', label: '3+ visits' },
  { value: '5', label: '5+ visits' },
];

const SORT_OPTIONS = [
  { value: 'visits', label: 'Most visits' },
  { value: 'recent', label: 'Latest visit' },
];

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_LOOKBACK_DAYS);
  return localDateString(d);
}

export default function NonBuyersPage() {
  const activeStoreId   = useSelector(selectActiveStoreId);
  const activeStoreName = useSelector(selectActiveStoreName);
  const isSuperAdmin    = useSelector(selectIsSuperAdmin);
  const availableStores = useSelector(selectAvailableStores);

  // Store logins only ever see their own store; a super admin can pick any store or all of them (like Buyers).
  const [storeFilter, setStoreFilter] = useState(() => (activeStoreId ? String(activeStoreId) : 'all'));
  const [prevActiveStoreId, setPrevActiveStoreId] = useState(activeStoreId);
  if (activeStoreId !== prevActiveStoreId) {
    setPrevActiveStoreId(activeStoreId);
    setStoreFilter(activeStoreId ? String(activeStoreId) : 'all');
  }
  const companyId = isSuperAdmin ? storeFilter : activeStoreId;
  const companyName = !isSuperAdmin || storeFilter === String(activeStoreId)
    ? activeStoreName
    : storeFilter === 'all'
      ? null
      : availableStores.find((s) => String(s.company_id) === storeFilter)?.mailing_name;

  const [search, setSearch]       = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [fromDate, setFromDate]   = useState(defaultFromDate);
  const [toDate, setToDate]       = useState('');
  const [minVisits, setMinVisits] = useState(DEFAULT_MIN_VISITS);
  const [sortBy, setSortBy]       = useState(DEFAULT_SORT);
  const [selected, setSelected]   = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const debounceRef = useRef(null);

  const handleSearchChange = (value) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value.trim()), APP_CONFIG.SEARCH.DEBOUNCE_MS);
  };
  const clearSearch = () => {
    clearTimeout(debounceRef.current);
    setSearch('');
    setDebouncedSearch('');
  };

  const filters = { companyId, from: fromDate, to: toDate, minVisits, sort: sortBy, search: debouncedSearch };
  const {
    nonBuyers, total, pastBuyerCount, hasMore, loadMore, isLoadingMore, isLoading, isFetching, isError, refresh,
  } = useNonBuyers(filters);

  // Load the next page as the list's end scrolls into view (same pattern as the Buyers page).
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isLoadingMore) loadMore();
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  const hasDateFilter = !!fromDate || !!toDate;
  const hasActiveFilters = fromDate !== defaultFromDate() || !!toDate
    || minVisits !== DEFAULT_MIN_VISITS || sortBy !== DEFAULT_SORT
    || (isSuperAdmin && storeFilter !== String(activeStoreId));

  const clearFilters = () => {
    setFromDate(defaultFromDate());
    setToDate('');
    setMinVisits(DEFAULT_MIN_VISITS);
    setSortBy(DEFAULT_SORT);
    if (isSuperAdmin) setStoreFilter(activeStoreId ? String(activeStoreId) : 'all');
  };

  const searchInput = (
    <div className="relative w-full">
      <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        inputMode="search"
        placeholder="Search by name or mobile number"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        className="h-11 w-full pl-9 pr-9"
        aria-label="Search non-buyers"
      />
      {search.length > 0 && (
        <button
          type="button"
          onClick={clearSearch}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const dateInputs = (
    <div className="flex items-center gap-2 w-full">
      <Input
        type="date"
        value={fromDate}
        max={toDate || todayDateString()}
        onChange={(e) => setFromDate(e.target.value)}
        aria-label="From date"
        className="h-11 flex-1 min-w-0"
      />
      <span className="text-muted-foreground text-sm shrink-0">to</span>
      <Input
        type="date"
        value={toDate}
        min={fromDate || undefined}
        max={todayDateString()}
        onChange={(e) => setToDate(e.target.value)}
        aria-label="To date"
        className="h-11 flex-1 min-w-0"
      />
      {hasDateFilter && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => { setFromDate(''); setToDate(''); }}
          aria-label="Show all dates"
          className="h-11 w-11 shrink-0"
        >
          <X size={14} aria-hidden="true" />
        </Button>
      )}
    </div>
  );

  const storeSelect = isSuperAdmin && (
    <Select value={storeFilter} onValueChange={setStoreFilter}>
      <SelectTrigger className="h-11 w-full" aria-label="Store">
        <SelectValue placeholder="All stores" />
      </SelectTrigger>
      <SelectContent align="start" className="max-h-72 overflow-y-auto">
        <SelectItem value="all">All stores</SelectItem>
        {availableStores.map((store) => (
          <SelectItem key={store.company_id} value={String(store.company_id)}>{store.mailing_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const minVisitsSelect = (
    <Select value={minVisits} onValueChange={setMinVisits}>
      <SelectTrigger className="h-11 w-full" aria-label="Minimum visits">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {MIN_VISIT_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const sortSelect = (
    <Select value={sortBy} onValueChange={setSortBy}>
      <SelectTrigger className="h-11 w-full" aria-label="Sort by">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {SORT_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-4 w-full p-4 pb-28 md:p-6 md:pb-6">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-2 border-b border-border bg-background px-4 pt-4 pb-3 md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
        <div>
          <h1 className="text-lg font-bold text-foreground">Non-Buyers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Walk-ins at {companyId === 'all' ? 'every store' : (companyName ?? 'this store')} who visited but haven&rsquo;t bought since their first visit in the period.
          </p>
        </div>

        {/* Tablet and desktop: every control inline. Phones use the Filter pill + bottom sheet below. */}
        <div className="hidden md:flex md:flex-col md:gap-2 lg:flex-row lg:items-center">
          <div className="lg:flex-1 lg:min-w-56">{searchInput}</div>
          <div className="lg:w-80">{dateInputs}</div>
          <div className="flex items-center gap-2">
            {storeSelect && <div className="flex-1 lg:w-48 lg:flex-none">{storeSelect}</div>}
            <div className="flex-1 lg:w-32 lg:flex-none">{minVisitsSelect}</div>
            <div className="flex-1 lg:w-36 lg:flex-none">{sortSelect}</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => refresh()}
              disabled={isFetching}
              aria-label="Refresh"
              className="h-11 w-11 shrink-0"
            >
              <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
            </Button>
          </div>
        </div>

        {!isLoading && !isError && (
          <p className="text-xs text-muted-foreground">
            {total} non-buyer{total !== 1 ? 's' : ''}
            {pastBuyerCount > 0 ? ` · ${pastBuyerCount} bought here before` : ''}
            {hasDateFilter ? '' : ' · all dates'}
          </p>
        )}
      </div>

      <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Matching walk-ins against orders and invoices…
          </div>
        ) : isError ? (
          <ErrorState
            className="col-span-full"
            title="Couldn't load walk-ins or orders."
            onRetry={() => refresh()}
          />
        ) : nonBuyers.length === 0 ? (
          <EmptyState
            className="col-span-full"
            icon={UserX}
            title={debouncedSearch ? 'No matching non-buyers.' : 'No non-buyers for these filters.'}
            description={debouncedSearch ? undefined : 'Try fewer minimum visits or a wider date range.'}
          />
        ) : (
          nonBuyers.map((nonBuyer) => (
            <NonBuyerListItem
              key={nonBuyer.key}
              nonBuyer={nonBuyer}
              onSelect={() => setSelected(nonBuyer)}
            />
          ))
        )}
      </StaggerList>

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4 text-sm text-muted-foreground">
          {isLoadingMore && (
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading more…
            </span>
          )}
        </div>
      )}

      <BuyersMobileFilterBar
        hasActiveFilters={hasActiveFilters || !!debouncedSearch}
        onOpenFilters={() => setIsFilterOpen(true)}
        showSync
        isSyncing={isFetching}
        onSync={() => refresh()}
      />

      <BottomSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Filters"
        footerClassName="p-0"
        footer={
          <div className="flex items-stretch">
            <Button
              type="button"
              variant="outline"
              className="min-h-14 flex-1 rounded-none"
              onClick={() => { clearFilters(); clearSearch(); }}
            >
              Clear All
            </Button>
            <Button type="button" className="min-h-14 flex-1 rounded-none" onClick={() => setIsFilterOpen(false)}>
              Apply Filters
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {searchInput}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Visit period</span>
            {dateInputs}
          </div>
          {storeSelect && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Store</span>
              {storeSelect}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Minimum visits</span>
              {minVisitsSelect}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Sort by</span>
              {sortSelect}
            </div>
          </div>
        </div>
      </BottomSheet>

      <NonBuyerDetailSheet
        nonBuyer={selected}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
