'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Receipt, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import { StaggerList } from '@/components/shared/StaggerList';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import OrderListItem from '@/components/features/orders/OrderListItem';
import OrderDetailSheet from '@/components/features/orders/OrderDetailSheet';
import { useOrders } from '@/hooks/orders/useOrders';
import { useAllOrders } from '@/hooks/orders/useAllOrders';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString } from '@/lib/dateUtils';

// document_status feeds order.status — see deriveDocumentStatus in useCustomerOrders.js.
const STATUS_OPTIONS = [
  { value: 'paid',      label: 'Paid' },
  { value: 'partial',   label: 'Partial' },
  { value: 'due',       label: 'Due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'draft',     label: 'Draft' },
];

export default function OrdersPage() {
  const [skip, setSkip] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [inputVal, setInputVal]     = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // debounced
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // 'paid' | 'partial' | 'due' | 'cancelled' | 'draft' | ''

  const debounceRef = useRef(null);

  // ── Paginated browse list (shown when no filter active) ──
  const {
    orders: pagedOrders,
    totalCount,
    take,
    isLoading: isPagedLoading,
    isFetching: isPagedFetching,
    isError: isPagedError,
    refetch,
  } = useOrders({ skip });

  // ── Full dataset (always fetching in background, ready for filtering) ──
  const {
    allOrders,
    isLoading: isAllLoading,
    isFetching: isAllFetching,
  } = useAllOrders();

  // ── Debounced search input ───────────────────────────────
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
    setStatusFilter('');
  };

  // ── Filter logic ─────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const isSearchActive =
    q.length >= APP_CONFIG.SEARCH.MIN_QUERY_LENGTH ||
    !!fromDate ||
    !!toDate ||
    !!statusFilter;

  const filteredOrders = useMemo(() => {
    if (!isSearchActive) return [];

    let result = allOrders;

    if (q.length >= APP_CONFIG.SEARCH.MIN_QUERY_LENGTH) {
      result = result.filter((order) => {
        const orderNo  = order.orderNo?.toLowerCase() ?? '';
        const customer = order.customerName?.toLowerCase() ?? '';
        return orderNo.includes(q) || customer.includes(q);
      });
    }

    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      result = result.filter(
        (order) => order.orderDate && new Date(order.orderDate) >= from
      );
    }

    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      result = result.filter(
        (order) => order.orderDate && new Date(order.orderDate) <= to
      );
    }

    if (statusFilter) {
      result = result.filter((order) => order.status === statusFilter);
    }

    return result;
  }, [allOrders, q, fromDate, toDate, statusFilter, isSearchActive]);

  // ── Display resolution ───────────────────────────────────
  const displayOrders = isSearchActive ? filteredOrders : pagedOrders;

  const isFilterBusy = isSearchActive && isAllLoading && allOrders.length === 0;
  const isLoading    = isSearchActive ? isFilterBusy : isPagedLoading;
  const isError      = isSearchActive ? false : isPagedError;
  const hasFilters   = !!inputVal || !!fromDate || !!toDate || !!statusFilter;

  const totalPages  = Math.max(1, Math.ceil(totalCount / take));
  const currentPage = Math.floor(skip / take) + 1;

  return (
    <div className="flex flex-col gap-3 w-full p-4 md:p-6">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-2 border-b border-border bg-background px-4 pt-4 pb-3 md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
        {isAllFetching && !isAllLoading && (
          <div className="flex justify-end -mb-1">
            <Loader2 size={14} className="animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative md:flex-1 md:min-w-50">
            <Search
              size={16}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="Search by order number or customer"
              value={inputVal}
              onChange={handleSearchChange}
              className="pl-9 pr-9"
              aria-label="Search orders"
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

          <Select value={statusFilter || undefined} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-36" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent align="start">
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
            {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {/* ── List ────────────────────────────────────────── */}
      <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
        {isLoading ? (
          <InlineLoader className="col-span-full" label={isSearchActive ? 'Searching orders…' : 'Loading orders…'} />
        ) : isError ? (
          <ErrorState
            className="col-span-full"
            title="Failed to load orders."
            onRetry={() => refetch()}
          />
        ) : displayOrders.length === 0 ? (
          <EmptyState
            className="col-span-full"
            icon={Receipt}
            title={isSearchActive ? 'No orders match your filters.' : 'No orders found.'}
          />
        ) : (
          displayOrders.map((order, idx) => (
            <OrderListItem
              key={order.orderId ?? idx}
              order={order}
              onSelect={() => setSelectedOrder(order)}
            />
          ))
        )}
      </StaggerList>
      {!isSearchActive && totalCount > take && (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex items-center justify-between border-t border-border bg-background px-4 pt-3 pb-4 md:-mx-6 md:-mb-6 md:px-6 md:pb-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSkip((s) => Math.max(0, s - take))}
            disabled={skip === 0 || isPagedFetching}
            className="gap-1"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} · {totalCount} orders
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSkip((s) => s + take)}
            disabled={skip + take >= totalCount || isPagedFetching}
            className="gap-1"
            aria-label="Next page"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      )}

      <OrderDetailSheet
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}