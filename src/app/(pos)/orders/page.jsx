'use client';

import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Receipt, X } from 'lucide-react';
import { toast } from 'sonner';
import { downloadDocumentList } from '@/lib/documentListExport';
import { useSelector } from 'react-redux';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { switchCompany } from '@/services/storeService';
import { fetchStoreScopedDocuments } from '@/services/crossStoreDocuments';
import { normalizeCustomerOrder } from '@/hooks/customer/useCustomerOrders';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import { StaggerList } from '@/components/shared/StaggerList';
import { DocumentFiltersHeader, DocumentFiltersSheet, DocumentMobileFilterBar } from '@/components/shared/DocumentListFilters';
import OrderListItem from '@/components/features/orders/OrderListItem';
import OrderDetailSheet from '@/components/features/orders/OrderDetailSheet';
import { useOrders } from '@/hooks/orders/useOrders';
import { useAllOrders } from '@/hooks/orders/useAllOrders';
import { useReadyToBillOrders } from '@/hooks/orders/useReadyToBillOrders';
import { useWorkflowStatuses } from '@/hooks/workflow/useOrderWorkflowStatus';
import { WORKFLOW_STAGES, getStageMeta } from '@/lib/workflow/workflowConstants';
import APP_CONFIG from '@/constants/appConfig';

// document_status feeds order.status — see deriveDocumentStatus in useCustomerOrders.js.
const STATUS_OPTIONS = [
  { value: 'ready',     label: 'Ready to bill' },
  { value: 'paid',      label: 'Paid' },
  { value: 'partial',   label: 'Partial' },
  { value: 'due',       label: 'Due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'draft',     label: 'Draft' },
];

export default function OrdersPage() {
  const [skip, setSkip] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const initialOrderParam = () => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('order') ?? '');
  const [inputVal, setInputVal]     = useState(initialOrderParam);
  const [searchQuery, setSearchQuery] = useState(initialOrderParam); // debounced
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // 'paid' | 'partial' | 'due' | 'cancelled' | 'draft' | ''
  const [hideFreebies, setHideFreebies] = useState(false);
  const [workflowStage, setWorkflowStage] = useState(''); // '' | 'any' | 'none' | stage key
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const debounceRef = useRef(null);
  const { byOrder: readyByOrder } = useReadyToBillOrders();
  // /orders?order=<document no> (e.g. from scanning a reserved piece) searches for that order and opens it.
  const [deepLinkOrder, setDeepLinkOrder] = useState(() => (
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('order')
  ));

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
  const [isExporting, setIsExporting] = useState(false);
  const activeStoreId = useSelector(selectActiveStoreId);

  const deepLinked = deepLinkOrder ? allOrders.find((o) => o.orderNo === deepLinkOrder) ?? null : null;
  const openOrder = selectedOrder ?? deepLinked;
  const closeOrder = () => { setSelectedOrder(null); setDeepLinkOrder(null); };

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
    setHideFreebies(false);
    setWorkflowStage('');
  };

  // ── Filter logic ─────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const isSearchActive =
    q.length >= APP_CONFIG.SEARCH.MIN_QUERY_LENGTH ||
    !!fromDate ||
    !!toDate ||
    !!statusFilter ||
    hideFreebies ||
    !!workflowStage;

  // Workflow stages: the whole store's list while filtering (or choosing a filter), otherwise just this page.
  const workflowDocNos = (isSearchActive || isFilterOpen ? allOrders : pagedOrders)
    .filter((o) => o.documentType === 'order')
    .map((o) => o.orderNo);
  const { statuses: workflowStatuses, isLoading: isWorkflowLoading } = useWorkflowStatuses(workflowDocNos);
  const stageOf = (order) => {
    const step = workflowStatuses[order.orderNo]?.current_step;
    return step ? (getStageMeta(step)?.key ?? step) : null;
  };

  const applyFilters = (list) => {
    let result = list;

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

    if (statusFilter === 'ready') {
      result = result.filter((order) => readyByOrder.has(order.orderNo));
    } else if (statusFilter) {
      result = result.filter((order) => order.status === statusFilter);
    }

    if (hideFreebies) {
      result = result.filter((order) => Number(order.totalAmount) !== 0);
    }

    if (workflowStage === 'any') {
      result = result.filter((order) => stageOf(order));
    } else if (workflowStage === 'none') {
      result = result.filter((order) => !stageOf(order));
    } else if (workflowStage) {
      result = result.filter((order) => stageOf(order) === workflowStage);
    }

    return result;
  };

  const filteredOrders = isSearchActive ? applyFilters(allOrders) : [];

  // ── Display resolution ───────────────────────────────────
  const displayOrders = isSearchActive ? filteredOrders : pagedOrders;

  const stageCounts = {};
  for (const order of allOrders) {
    const key = order.documentType === 'order' ? stageOf(order) : null;
    if (key) stageCounts[key] = (stageCounts[key] ?? 0) + 1;
  }
  const inWorkflowCount = Object.values(stageCounts).reduce((a, b) => a + b, 0);
  const workflowOptions = [
    { value: 'any', label: `In workflow (any stage) · ${inWorkflowCount}` },
    ...WORKFLOW_STAGES.map((st) => ({ value: st.key, label: `${st.stepNumber}. ${st.label} · ${stageCounts[st.key] ?? 0}` })),
    { value: 'none', label: 'Not in workflow' },
  ];

  const isFilterBusy = isSearchActive && ((isAllLoading && allOrders.length === 0) || (!!workflowStage && isWorkflowLoading));
  const isLoading    = isSearchActive ? isFilterBusy : isPagedLoading;
  const isError      = isSearchActive ? false : isPagedError;
  const hasFilters   = !!inputVal || !!fromDate || !!toDate || !!statusFilter || hideFreebies || !!workflowStage;
  const filterCount  = [fromDate || toDate, statusFilter, hideFreebies, workflowStage].filter(Boolean).length;
  const searchProps  = {
    value: inputVal,
    onChange: handleSearchChange,
    onClear: () => { clearTimeout(debounceRef.current); setInputVal(''); setSearchQuery(''); },
    placeholder: 'Search by order number or customer',
    label: 'Search orders',
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      await switchCompany(activeStoreId);
      const { entities } = await fetchStoreScopedDocuments({ kind: 'order', companyId: activeStoreId });
      const fresh = entities.filter((e) => e.company_id === activeStoreId).map((e) => normalizeCustomerOrder(e, 'order')).filter(Boolean);
      const rows = (isSearchActive ? applyFilters(fresh) : fresh).filter((o) => o.documentType === 'order');
      if (!rows.length) { toast.info('No orders to download.'); return; }
      downloadDocumentList({ kind: 'order', entities: rows.map((o) => o.raw) });
    } catch {
      toast.error('Could not load orders for download. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages  = Math.max(1, Math.ceil(totalCount / take));
  const currentPage = Math.floor(skip / take) + 1;

  return (
    <div className="flex flex-col gap-3 w-full p-4 pb-28 md:p-6 md:pb-6">
      <div className={`sticky top-0 z-10 -mx-4 -mt-4 ${hasFilters ? 'flex' : 'hidden md:flex'} flex-col gap-2 border-b border-border bg-background px-4 pt-4 pb-3 md:-mx-6 md:-mt-6 md:px-6 md:pt-6`}>
        {isAllFetching && !isAllLoading && (
          <div className="flex justify-end -mb-1">
            <Loader2 size={14} className="animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <DocumentFiltersHeader
          search={searchProps}
          filterCount={filterCount}
          onOpenFilters={() => setIsFilterOpen(true)}
          onDownload={handleDownload}
          isDownloading={isExporting}
          downloadDisabled={false}
          onClearAll={handleClearAll}
          hasFilters={hasFilters}
        />
        {hasFilters && (
          <div className="md:hidden flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {isSearchActive && !isFilterBusy ? `${filteredOrders.length} order${filteredOrders.length !== 1 ? 's' : ''} found` : 'Filtering…'}
              {filterCount > 0 && ` · ${filterCount} filter${filterCount !== 1 ? 's' : ''}`}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={handleClearAll} className="h-8 gap-1">
              <X size={14} aria-hidden="true" />
              Clear
            </Button>
          </div>
        )}

        {isSearchActive && !isFilterBusy && (
          <p className="hidden md:block text-xs text-muted-foreground">
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
              key={`${order.documentType}-${order.orderId ?? order.orderNo ?? idx}`}
              order={order}
              readyLines={readyByOrder.get(order.orderNo) ?? null}
              workflow={workflowStatuses[order.orderNo] ?? null}
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
        order={openOrder}
        isOpen={!!openOrder}
        onClose={closeOrder}
        readyLines={openOrder ? readyByOrder.get(openOrder.orderNo) ?? null : null}
      />

      <DocumentMobileFilterBar
        hasActiveFilters={hasFilters}
        onOpenFilters={() => setIsFilterOpen(true)}
        onDownload={handleDownload}
        isDownloading={isExporting}
        downloadDisabled={false}
      />

      <DocumentFiltersSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onClearAll={handleClearAll}
        search={searchProps}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        status={{ value: statusFilter, onChange: setStatusFilter, options: STATUS_OPTIONS }}
        workflow={{ value: workflowStage, onChange: setWorkflowStage, options: workflowOptions, isLoading: isWorkflowLoading || isAllLoading }}
        hideFreebies={hideFreebies}
        onHideFreebiesChange={setHideFreebies}
      />
    </div>
  );
}