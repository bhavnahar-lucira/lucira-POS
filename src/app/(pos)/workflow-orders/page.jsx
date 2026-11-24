'use client';

import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { ChevronLeft, ChevronRight, RefreshCw, Workflow, X } from 'lucide-react';
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
import WorkflowOrderListItem from '@/components/features/workflow/WorkflowOrderListItem';
import WorkflowOrderDetailSheet from '@/components/features/workflow/WorkflowOrderDetailSheet';
import { useWorkflowOrders } from '@/hooks/workflow/useWorkflowOrders';
import { WORKFLOW_STAGES, WORKFLOW_STATUS_OPTIONS } from '@/lib/workflow/workflowConstants';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString } from '@/lib/dateUtils';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { selectAvailableStores, selectActiveStoreName } from '@/store/slices/storeSlice';

const PAGE_SIZE = 24;
const ALL = 'all';

export default function WorkflowOrdersPage() {
  const [inputVal, setInputVal] = useState('');
  const [search, setSearch] = useState('');
  const [step, setStep] = useState(ALL);
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const availableStores = useSelector(selectAvailableStores);
  const activeStoreName = useSelector(selectActiveStoreName);
  const storeOptions = (availableStores ?? [])
    .filter((s) => s.company_code)
    .map((s) => ({ value: s.company_code, label: `${s.mailing_name ?? s.company_code} (${s.company_code})` }));
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const { orders, meta, total, totalPages, isLoading, isFetching, error, refetch, updatedAt } = useWorkflowOrders({
    search, step, status, from_date: fromDate, to_date: toDate, store: isSuperAdmin ? storeCode : '', page, pageSize: PAGE_SIZE,
  });

  const withReset = (setter) => (value) => { setter(value); setPage(1); };
  const changeStep = withReset(setStep);
  const changeStatus = withReset(setStatus);
  const changeFrom = withReset(setFromDate);
  const changeTo = withReset(setToDate);
  const changeStore = withReset(setStoreCode);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(val.trim()); setPage(1); }, val.trim() ? APP_CONFIG.SEARCH.DEBOUNCE_MS : 0);
  };

  const handleClearAll = () => {
    clearTimeout(debounceRef.current);
    setInputVal('');
    setSearch('');
    setStep(ALL);
    setStatus('');
    setFromDate('');
    setToDate('');
    setStoreCode('');
    setPage(1);
  };

  const filterCount = [step !== ALL, status, fromDate || toDate, isSuperAdmin && storeCode].filter(Boolean).length;
  const hasFilters = filterCount > 0 || !!inputVal;
  const searchProps = {
    value: inputVal,
    onChange: handleSearchChange,
    onClear: () => { clearTimeout(debounceRef.current); setInputVal(''); setSearch(''); setPage(1); },
    placeholder: 'Search order, PO, ERP doc, customer or SKU',
    label: 'Search workflow orders',
  };
  const refreshAction = { label: 'Refresh', icon: RefreshCw, onClick: () => refetch(), busy: isFetching, spinIcon: true };

  const stageCounts = meta?.stage_counts ?? {};
  const allCount = Object.values(stageCounts).reduce((a, b) => a + b, 0);
  const stageTabs = [
    { key: ALL, label: `All${allCount ? ` · ${allCount}` : ''}` },
    ...WORKFLOW_STAGES.map((s) => ({ key: s.key, label: `${s.label}${stageCounts[s.key] ? ` · ${stageCounts[s.key]}` : ''}` })),
  ];

  return (
    <div className="flex flex-col gap-3 w-full p-4 pb-28 md:p-6 md:pb-6">
      <div className={`sticky top-0 z-10 -mx-4 -mt-4 ${hasFilters || updatedAt > 0 ? 'flex' : 'hidden md:flex'} flex-col gap-2 border-b border-border bg-background px-4 pt-4 pb-3 md:-mx-6 md:-mt-6 md:px-6 md:pt-6`}>
        <ListFiltersHeader
          search={searchProps}
          filterCount={filterCount}
          onOpenFilters={() => setIsFilterOpen(true)}
          action={refreshAction}
          onClearAll={handleClearAll}
          hasFilters={hasFilters}
        />
        <div className="hidden md:block">
          <PillTabs tabs={stageTabs} value={step} onChange={changeStep} variant="chip" scrollable />
        </div>
        {updatedAt > 0 && (
          <p className="text-xs text-muted-foreground">
            Updated {new Date(updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · refreshes every minute
          </p>
        )}
        {hasFilters && (
          <div className="md:hidden flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Filtering…' : `${total} order${total !== 1 ? 's' : ''} found`}
              {filterCount > 0 && ` · ${filterCount} filter${filterCount !== 1 ? 's' : ''}`}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={handleClearAll} className="h-8 gap-1">
              <X size={14} aria-hidden="true" />
              Clear
            </Button>
          </div>
        )}
        {hasFilters && !isLoading && (
          <p className="hidden md:block text-xs text-muted-foreground">
            {total} order{total !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
        {isLoading ? (
          <InlineLoader className="col-span-full" label="Loading workflow orders…" />
        ) : error ? (
          <ErrorState className="col-span-full" title="Couldn't load workflow orders." description={error.message} onRetry={() => refetch()} />
        ) : orders.length === 0 ? (
          <EmptyState
            className="col-span-full"
            icon={Workflow}
            title={hasFilters ? 'No workflow orders match your filters.' : 'No workflow orders yet.'}
          />
        ) : (
          orders.map((order) => (
            <WorkflowOrderListItem key={order.id} order={order} onSelect={() => setSelectedOrder(order)} />
          ))
        )}
      </StaggerList>

      {!isLoading && !error && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} orders
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isFetching}
            aria-label="Next page"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
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
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-foreground">Store</h3>
              <Select value={storeCode || ALL} onValueChange={(v) => changeStore(v === ALL ? '' : v)}>
                <SelectTrigger className="h-11 w-full" aria-label="Filter by store">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" className="max-h-72">
                  <SelectItem value={ALL}>All stores</SelectItem>
                  {storeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </section>
          ) : (
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-foreground">Store</h3>
              <p className="text-sm text-muted-foreground">{activeStoreName ?? 'Your store'}</p>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Stage</h3>
            <Select value={step} onValueChange={changeStep}>
              <SelectTrigger className="h-11 w-full" aria-label="Filter by stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {stageTabs.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Status</h3>
            <Select value={status || ALL} onValueChange={(v) => changeStatus(v === ALL ? '' : v)}>
              <SelectTrigger className="h-11 w-full" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value={ALL}>All statuses</SelectItem>
                {WORKFLOW_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Created date</h3>
            <div className="flex items-center gap-2">
              <Input type="date" value={fromDate} max={todayDateString()} onChange={(e) => changeFrom(e.target.value)} aria-label="From date" className="h-11 flex-1 min-w-0" />
              <span className="text-muted-foreground text-sm shrink-0">to</span>
              <Input type="date" value={toDate} max={todayDateString()} onChange={(e) => changeTo(e.target.value)} aria-label="To date" className="h-11 flex-1 min-w-0" />
            </div>
          </section>
        </div>
      </BottomSheet>

      <WorkflowOrderDetailSheet order={selectedOrder} isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
