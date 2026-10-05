'use client';

// Invoice directory — paginated browse + full-dataset search/filter.
//
// Search/filter behavior (mirrors /orders pattern):
//   - Any text (2+ chars) or date range triggers a filter over the full
//     invoices dataset (useAllInvoices — fetched once with Take:0, cached).
//   - Empty search + no dates shows the paginated browse list via useInvoiceList.
//   - Pagination is hidden while any filter is active.
//   - A single Clear button resets all active filters at once.

import { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Receipt, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import { StaggerList } from '@/components/shared/StaggerList';
import { Input } from '@/components/ui/input';
import InvoiceListItem from '@/components/features/invoices/InvoiceListItem';
import InvoiceDetailSheet from '@/components/features/invoices/InvoiceDetailSheet';
import { useInvoiceList } from '@/hooks/invoices/useInvoiceList';
import { useAllInvoices } from '@/hooks/invoices/useAllInvoices';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString } from '@/lib/dateUtils';

export default function InvoicesPage() {
  const [skip, setSkip] = useState(0);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [inputVal, setInputVal]       = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // debounced
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');

  const debounceRef = useRef(null);

  // ── Paginated browse (shown when no filter active) ───────
  const {
    invoices: pagedInvoices,
    totalCount,
    take,
    isLoading: isPagedLoading,
    isFetching: isPagedFetching,
    isError: isPagedError,
    refetch,
  } = useInvoiceList({ skip });

  // ── Full dataset for filtering ───────────────────────────
  // PERF (2026-09-08) — gated on the operator having touched a filter at
  // all (raw input, or either date field), instead of firing this Take:0
  // full-dataset fetch unconditionally on every visit — most visits to this
  // page just page through pagedInvoices below and never search/filter.
  const {
    allInvoices,
    isLoading: isAllLoading,
    isFetching: isAllFetching,
  } = useAllInvoices({ enabled: !!inputVal || !!fromDate || !!toDate });

  // ── Debounced search ─────────────────────────────────────
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    clearTimeout(debounceRef.current);
    if (val.trim() === '') {
      setSearchQuery('');
      return;
    }
    debounceRef.current = setTimeout(
      () => setSearchQuery(val),
      APP_CONFIG.SEARCH.DEBOUNCE_MS
    );
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleClearAll = () => {
    clearTimeout(debounceRef.current);
    setInputVal('');
    setSearchQuery('');
    setFromDate('');
    setToDate('');
  };

  // ── Filter logic ─────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const isSearchActive =
    q.length >= APP_CONFIG.SEARCH.MIN_QUERY_LENGTH || !!fromDate || !!toDate;

  const filteredInvoices = useMemo(() => {
    if (!isSearchActive) return [];

    let result = allInvoices;

    if (q.length >= APP_CONFIG.SEARCH.MIN_QUERY_LENGTH) {
      result = result.filter((inv) => {
        const invoiceNo  = inv.invoiceNo?.toLowerCase() ?? '';
        const customer   = inv.customerName?.toLowerCase() ?? '';
        return invoiceNo.includes(q) || customer.includes(q);
      });
    }

    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      result = result.filter(
        (inv) => inv.invoiceDate && new Date(inv.invoiceDate) >= from
      );
    }

    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      result = result.filter(
        (inv) => inv.invoiceDate && new Date(inv.invoiceDate) <= to
      );
    }

    return result;
  }, [allInvoices, q, fromDate, toDate, isSearchActive]);

  // ── Display resolution ───────────────────────────────────
  const displayInvoices = isSearchActive ? filteredInvoices : pagedInvoices;

  const isFilterBusy = isSearchActive && isAllLoading && allInvoices.length === 0;
  const isLoading    = isSearchActive ? isFilterBusy : isPagedLoading;
  const isError      = isSearchActive ? false : isPagedError;
  const hasFilters   = !!inputVal || !!fromDate || !!toDate;

  const totalPages  = Math.max(1, Math.ceil(totalCount / take));
  const currentPage = Math.floor(skip / take) + 1;

  return (
    <div className="flex flex-col gap-3 w-full p-4 md:p-6">
      {/* ── Filters — sticky (2026-08-24) — see the identical block in
          orders/page.jsx for the full reasoning (native position:sticky,
          no JS pin/unpin logic needed; the negative-margin/padding swap
          cancels this page's own p-4/md:p-6 for just this block so the
          sticky bar's background spans the full column and its "stuck"
          position doesn't leave a gap where the page's top padding was). */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-2 border-b border-border bg-background px-4 pt-4 pb-3 md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
        {isAllFetching && !isAllLoading && (
          <div className="flex justify-end -mb-1">
            <Loader2 size={14} className="animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        )}

        {/* Search + dates share ONE row on md+ (reported directly,
            2026-10-03: wasted space stacking them on wide screens); mobile
            keeps the default flex-col stack — search gets its own full-width
            row first, then dates/clear follow below it. */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative md:flex-1 md:min-w-50">
            <Search
              size={16}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="Search by invoice number or customer"
              value={inputVal}
              onChange={handleSearchChange}
              className="pl-9 pr-9"
              aria-label="Search invoices"
            />
            {inputVal.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearTimeout(debounceRef.current);
                  setInputVal('');
                  setSearchQuery('');
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={fromDate}
              max={todayDateString()}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
              className="flex-1 min-w-0 md:w-36 md:flex-none"
            />
            <span className="text-muted-foreground text-sm shrink-0">to</span>
            <Input
              type="date"
              value={toDate}
              max={todayDateString()}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
              className="flex-1 min-w-0 md:w-36 md:flex-none"
            />
          </div>

          {hasFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="gap-1.5 shrink-0 w-full md:w-auto"
              aria-label="Clear all filters"
            >
              <X size={14} aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>

        {isSearchActive && !isFilterBusy && (
          <p className="text-xs text-muted-foreground">
            {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {/* ── List ────────────────────────────────────────── */}
      <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
        {isLoading ? (
          <InlineLoader className="col-span-full" label={isSearchActive ? 'Searching invoices…' : 'Loading invoices…'} />
        ) : isError ? (
          <ErrorState
            className="col-span-full"
            title="Failed to load invoices."
            onRetry={() => refetch()}
          />
        ) : displayInvoices.length === 0 ? (
          <EmptyState
            className="col-span-full"
            icon={Receipt}
            title={isSearchActive ? 'No invoices match your filters.' : 'No invoices found.'}
          />
        ) : (
          displayInvoices.map((invoice, idx) => (
            <InvoiceListItem
              key={invoice.invoiceId ?? idx}
              invoice={invoice}
              onSelect={() => setSelectedInvoice(invoice)}
            />
          ))
        )}
      </StaggerList>

      {/* ── Pagination — hidden while any filter is active. Sticky to the
          viewport bottom (same cancel-the-page's-own-padding technique as
          the sticky filter bar up top) so it stays reachable without
          scrolling all the way down a long list. ── */}
      {!isSearchActive && totalCount > take && (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center justify-between border-t border-border bg-background px-4 pt-3 pb-4 md:-mx-6 md:-mb-6 md:px-6 md:pb-6">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setSkip((s) => Math.max(0, s - take))}
            disabled={skip === 0 || isPagedFetching}
            aria-label="Previous page"
            className="h-9 w-9"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {skip + 1}–{Math.min(skip + take, totalCount)} of {totalCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setSkip((s) => s + take)}
            disabled={skip + take >= totalCount || isPagedFetching}
            aria-label="Next page"
            className="h-9 w-9"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      )}

      <InvoiceDetailSheet
        invoice={selectedInvoice}
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
    </div>
  );
}