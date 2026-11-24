'use client';

import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Receipt, X } from 'lucide-react';
import { toast } from 'sonner';
import { downloadDocumentList } from '@/lib/documentListExport';
import { useSelector } from 'react-redux';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { switchCompany } from '@/services/storeService';
import { fetchStoreScopedDocuments } from '@/services/crossStoreDocuments';
import { normalizeInvoice } from '@/hooks/invoices/useInvoiceList';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import { StaggerList } from '@/components/shared/StaggerList';
import { DocumentFiltersHeader, DocumentFiltersSheet, DocumentMobileFilterBar } from '@/components/shared/DocumentListFilters';
import InvoiceListItem from '@/components/features/invoices/InvoiceListItem';
import InvoiceDetailSheet from '@/components/features/invoices/InvoiceDetailSheet';
import { useInvoiceList } from '@/hooks/invoices/useInvoiceList';
import { useAllInvoices } from '@/hooks/invoices/useAllInvoices';
import APP_CONFIG from '@/constants/appConfig';

export default function InvoicesPage() {
  const [skip, setSkip] = useState(0);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [inputVal, setInputVal]       = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // debounced
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');
  const [hideFreebies, setHideFreebies] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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
  const {
    allInvoices,
    isLoading: isAllLoading,
    isFetching: isAllFetching,
  } = useAllInvoices({ enabled: !!inputVal || !!fromDate || !!toDate || hideFreebies });
  const [isExporting, setIsExporting] = useState(false);
  const activeStoreId = useSelector(selectActiveStoreId);

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
    setHideFreebies(false);
  };

  // ── Filter logic ─────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const isSearchActive =
    q.length >= APP_CONFIG.SEARCH.MIN_QUERY_LENGTH || !!fromDate || !!toDate || hideFreebies;

  const applyFilters = (list) => {
    let result = list;

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

    if (hideFreebies) {
      result = result.filter((inv) => Number(inv.totalAmount) !== 0);
    }

    return result;
  };

  const filteredInvoices = isSearchActive ? applyFilters(allInvoices) : [];

  // ── Display resolution ───────────────────────────────────
  const displayInvoices = isSearchActive ? filteredInvoices : pagedInvoices;

  const isFilterBusy = isSearchActive && isAllLoading && allInvoices.length === 0;
  const isLoading    = isSearchActive ? isFilterBusy : isPagedLoading;
  const isError      = isSearchActive ? false : isPagedError;
  const hasFilters   = !!inputVal || !!fromDate || !!toDate || hideFreebies;
  const filterCount  = [fromDate || toDate, hideFreebies].filter(Boolean).length;
  const searchProps  = {
    value: inputVal,
    onChange: handleSearchChange,
    onClear: () => { clearTimeout(debounceRef.current); setInputVal(''); setSearchQuery(''); },
    placeholder: 'Search by invoice number or customer',
    label: 'Search invoices',
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      await switchCompany(activeStoreId);
      const { entities } = await fetchStoreScopedDocuments({ kind: 'invoice', companyId: activeStoreId });
      const fresh = entities.filter((e) => e.company_id === activeStoreId).map(normalizeInvoice).filter(Boolean);
      const rows = isSearchActive ? applyFilters(fresh) : fresh;
      if (!rows.length) { toast.info('No invoices to download.'); return; }
      downloadDocumentList({ kind: 'invoice', entities: rows.map((r) => r.raw) });
    } catch {
      toast.error('Could not load invoices for download. Please try again.');
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
          downloadDisabled={isFilterBusy}
          onClearAll={handleClearAll}
          hasFilters={hasFilters}
        />
        {hasFilters && (
          <div className="md:hidden flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {isSearchActive && !isFilterBusy ? `${filteredInvoices.length} invoice${filteredInvoices.length !== 1 ? 's' : ''} found` : 'Filtering…'}
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

      <DocumentMobileFilterBar
        hasActiveFilters={hasFilters}
        onOpenFilters={() => setIsFilterOpen(true)}
        onDownload={handleDownload}
        isDownloading={isExporting}
        downloadDisabled={isFilterBusy}
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
        hideFreebies={hideFreebies}
        onHideFreebiesChange={setHideFreebies}
      />
    </div>
  );
}