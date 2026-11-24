'use client';

import { Download, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { todayDateString } from '@/lib/dateUtils';

export function DocumentSearchInput({ value, onChange, onClear, placeholder, label, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="h-11 w-full pl-9 pr-9"
        aria-label={label}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function ActiveDot({ show }) {
  return show ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null;
}

/** Desktop header: search, Filters (opens the sheet), one action button and Clear. Hidden on phones. */
export function ListFiltersHeader({ search, filterCount, onOpenFilters, action, onClearAll, hasFilters }) {
  const ActionIcon = action?.icon;
  return (
    <div className="hidden md:flex items-center gap-2">
      <DocumentSearchInput {...search} className="flex-1 min-w-0" />
      <Button type="button" variant="outline" onClick={onOpenFilters} className="h-11 gap-2 shrink-0">
        <SlidersHorizontal size={16} aria-hidden="true" />
        Filters{filterCount > 0 ? ` (${filterCount})` : ''}
        <ActiveDot show={filterCount > 0} />
      </Button>
      {action && (
        <Button type="button" variant="outline" onClick={action.onClick} disabled={action.busy || action.disabled} className="h-11 gap-1.5 shrink-0">
          {action.busy && !action.spinIcon ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ActionIcon size={14} className={action.busy ? 'animate-spin' : ''} aria-hidden="true" />}
          {action.label}
        </Button>
      )}
      {hasFilters && (
        <Button type="button" variant="ghost" onClick={onClearAll} className="h-11 gap-1.5 shrink-0" aria-label="Clear all filters">
          <X size={14} aria-hidden="true" />
          Clear
        </Button>
      )}
    </div>
  );
}

/** Floating pill on phones: one action + Filter, so the list keeps the whole screen. */
export function ListMobileFilterBar({ hasActiveFilters, onOpenFilters, action }) {
  const ActionIcon = action?.icon;
  return (
    <div className="md:hidden fixed inset-x-0 bottom-4 z-30 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-stretch overflow-hidden rounded-full bg-primary text-background shadow-xl">
        {action && (
          <>
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.busy || action.disabled}
              aria-label={action.label}
              className="flex items-center gap-2 px-6 py-3 text-sm font-medium active:bg-white/10 disabled:opacity-60"
            >
              {action.busy && !action.spinIcon ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ActionIcon size={16} className={action.busy ? 'animate-spin' : ''} aria-hidden="true" />}
              {action.shortLabel ?? action.label}
            </button>
            <div className="w-px my-2 bg-background/25" aria-hidden="true" />
          </>
        )}
        <button type="button" onClick={onOpenFilters} className="flex items-center gap-2 px-6 py-3 text-sm font-medium active:bg-white/10">
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filter
          <ActiveDot show={hasActiveFilters} />
        </button>
      </div>
    </div>
  );
}

const downloadAction = (onDownload, isDownloading, downloadDisabled) => ({
  label: 'Download Excel', shortLabel: 'Excel', icon: Download,
  onClick: onDownload, busy: isDownloading, disabled: downloadDisabled,
});

export function DocumentFiltersHeader({ onDownload, isDownloading, downloadDisabled, ...rest }) {
  return <ListFiltersHeader {...rest} action={downloadAction(onDownload, isDownloading, downloadDisabled)} />;
}

export function DocumentMobileFilterBar({ onDownload, isDownloading, downloadDisabled, ...rest }) {
  return <ListMobileFilterBar {...rest} action={downloadAction(onDownload, isDownloading, downloadDisabled)} />;
}

/**
 * Filters sheet for the Orders / Invoices lists: search (phones only — desktop keeps it in the header),
 * date range, optional status, and the ₹0 freebie toggle.
 */
export function DocumentFiltersSheet({
  isOpen, onClose, onClearAll, search,
  fromDate, toDate, onFromDateChange, onToDateChange,
  status, workflow, hideFreebies, onHideFreebiesChange,
}) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filters"
      footerClassName="p-0"
      footer={
        <div className="flex items-stretch">
          <Button type="button" variant="outline" className="min-h-14 flex-1 rounded-none" onClick={onClearAll}>
            Clear All
          </Button>
          <Button type="button" className="min-h-14 flex-1 rounded-none" onClick={onClose}>
            Apply Filters
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="md:hidden">
          <DocumentSearchInput {...search} />
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">Date</h3>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={fromDate}
              max={todayDateString()}
              onChange={(e) => onFromDateChange(e.target.value)}
              aria-label="From date"
              className="h-11 flex-1 min-w-0"
            />
            <span className="text-muted-foreground text-sm shrink-0">to</span>
            <Input
              type="date"
              value={toDate}
              max={todayDateString()}
              onChange={(e) => onToDateChange(e.target.value)}
              aria-label="To date"
              className="h-11 flex-1 min-w-0"
            />
            {(fromDate || toDate) && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => { onFromDateChange(''); onToDateChange(''); }}
                aria-label="Clear date filter"
                className="h-11 w-11 shrink-0"
              >
                <X size={14} aria-hidden="true" />
              </Button>
            )}
          </div>
        </section>

        {status && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Status</h3>
            <Select value={status.value || 'all'} onValueChange={(v) => status.onChange(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-11 w-full" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="all">All statuses</SelectItem>
                {status.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
        )}

        {workflow && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Workflow stage</h3>
            <Select value={workflow.value || 'all'} onValueChange={(v) => workflow.onChange(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-11 w-full" aria-label="Filter by workflow stage">
                <SelectValue placeholder="All orders" />
              </SelectTrigger>
              <SelectContent align="start" className="max-h-72">
                <SelectItem value="all">All orders</SelectItem>
                {workflow.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {workflow.isLoading && <p className="text-xs text-muted-foreground">Loading workflow stages…</p>}
          </section>
        )}

        <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2">
          <span className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Hide ₹0 freebies</span>
            <span className="text-xs text-muted-foreground">Leaves out bills with a ₹0 total</span>
          </span>
          <Switch checked={hideFreebies} onCheckedChange={onHideFreebiesChange} aria-label="Hide ₹0 freebie bills" />
        </label>
      </div>
    </BottomSheet>
  );
}
