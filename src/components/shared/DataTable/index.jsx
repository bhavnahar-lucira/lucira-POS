'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Columns3, Minus, Plus, Search, X,
} from 'lucide-react';

import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PAGE_SIZES = [25, 50, 100];
const ALL = '__all';

const isBlank = (v) => v == null || v === '';

function compareValues(a, b) {
  if (isBlank(a)) return isBlank(b) ? 0 : -1;
  if (isBlank(b)) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

const displayValue = (column, value, row) => (column.format ? column.format(value, row) : value ?? '—');

function formatTotal(column, value) {
  if (column.format) return column.format(value);
  return Number(value.toFixed(3)).toLocaleString('en-IN');
}

const alignClass = (column) => (column.align === 'right' ? 'text-right tabular-nums' : '');

function FacetFilter({ column }) {
  'use no memo'; // `column` is a stable TanStack object; compiler memoization would freeze the selected value
  const meta = column.columnDef.meta;
  const options = [...column.getFacetedUniqueValues().keys()]
    .filter((v) => !isBlank(v))
    .sort(compareValues)
    .map((v) => ({ value: String(v), label: String(displayValue(meta, v)) }));
  if (options.length < 2) return null;

  return (
    <Select
      value={column.getFilterValue() ?? ALL}
      onValueChange={(v) => column.setFilterValue(v === ALL ? undefined : v)}
    >
      <SelectTrigger className="h-10 w-full min-w-0 md:h-9 md:w-44" aria-label={`Filter by ${meta.label}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {meta.label}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/**
 * Searchable, sortable, paginated report table with per-column filters and a
 * Columns menu. `columns`: { key, label, align?, format?, total?, filter?, mobile?, hidden? }.
 * `hidden` columns start unticked in the Columns menu, so they show only when chosen there.
 * Below md only `mobile` columns are shown (default: first two); the rest open
 * from each row's expand button. onViewChange receives the filtered + sorted
 * rows and the visible columns, for exports that should match the screen.
 * onRowClick(row) makes each row open something (keep a real link in a cell for keyboard users).
 */
export default function DataTable({ columns, rows, isLoading, isError, onRetry, emptyMessage, onViewChange, onRowClick }) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState(
    () => Object.fromEntries(columns.filter((c) => c.hidden).map((c) => [c.key, false])),
  );
  const [expanded, setExpanded] = useState({});

  const columnDefs = useMemo(() => columns.map((c) => ({
    id: c.key,
    accessorFn: (row) => row[c.key],
    header: c.label,
    meta: c,
    sortingFn: (a, b, id) => compareValues(a.getValue(id), b.getValue(id)),
    filterFn: (row, id, value) => String(row.getValue(id)) === value,
  })), [columns]);

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting, globalFilter, columnFilters, columnVisibility, expanded },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (row, id, value) => String(row.getValue(id) ?? '').toLowerCase().includes(value.trim().toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize: 50 } },
  });

  const visibleColumns = table.getVisibleLeafColumns();
  const mobileKeys = useMemo(() => {
    const flagged = visibleColumns.filter((c) => c.columnDef.meta.mobile);
    return new Set((flagged.length ? flagged : visibleColumns.slice(0, 2)).map((c) => c.id));
  }, [visibleColumns]);
  const hasMobileDetails = visibleColumns.length > mobileKeys.size;
  const cellClass = (column) => `${alignClass(column.columnDef.meta)} ${mobileKeys.has(column.id) ? '' : 'hidden md:table-cell'}`;

  const viewRows = table.getPrePaginationRowModel().rows;
  const totalColumns = useMemo(() => visibleColumns.filter((c) => c.columnDef.meta.total), [visibleColumns]);
  const totals = useMemo(() => Object.fromEntries(totalColumns.map((c) => [
    c.id, viewRows.reduce((sum, row) => sum + (Number(row.getValue(c.id)) || 0), 0),
  ])), [totalColumns, viewRows]);

  useEffect(() => {
    onViewChange?.({
      rows: viewRows.map((r) => r.original),
      columns: visibleColumns.map((c) => c.columnDef.meta),
    });
  }, [onViewChange, viewRows, visibleColumns]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
            {columns.slice(0, 6).map((c) => <Skeleton key={c.key} className="h-4 flex-1" />)}
          </div>
        ))}
      </div>
    );
  }

  if (isError) return <ErrorState title="Failed to load this report." onRetry={onRetry} />;
  if (!rows.length) return <EmptyState title={emptyMessage ?? 'No records for this range.'} />;

  const facetColumns = visibleColumns.filter((c) => c.columnDef.meta.filter);
  const isFiltered = !!globalFilter || columnFilters.length > 0;
  const { pageIndex, pageSize } = table.getState().pagination;
  const filteredCount = viewRows.length;
  const firstRow = filteredCount ? pageIndex * pageSize + 1 : 0;
  const lastRow = Math.min((pageIndex + 1) * pageSize, filteredCount);
  const mobileExtraTotals = totalColumns.filter((c) => !mobileKeys.has(c.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="relative w-full md:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Search all columns"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            aria-label="Search report"
            className="h-10 pl-8 md:h-9"
          />
        </div>

        {facetColumns.length > 0 && (
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
            {facetColumns.map((c) => <FacetFilter key={c.id} column={c} />)}
          </div>
        )}

        <div className="flex gap-2 md:ml-auto">
          {isFiltered && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setGlobalFilter(''); setColumnFilters([]); }}
              className="gap-1.5"
            >
              <X size={14} aria-hidden="true" />
              Clear filters
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 ml-auto md:ml-0">
                <Columns3 size={14} aria-hidden="true" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-80">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table.getAllLeafColumns().map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  disabled={c.getIsVisible() && visibleColumns.length === 1}
                  onCheckedChange={(v) => c.toggleVisibility(!!v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.columnDef.meta.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Scrolls both axes on this one div so the sticky header/footer anchor here, not on the Table primitive's own overflow wrapper. */}
      <div className="rounded-xl border border-border max-h-[65vh] overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {hasMobileDetails && <TableHead className="sticky top-0 z-1 w-10 bg-muted md:hidden" aria-label="Details" />}
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
                  return (
                    <TableHead
                      key={header.id}
                      className={`sticky top-0 z-1 bg-muted ${cellClass(header.column)}`}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={`inline-flex items-center gap-1 hover:text-foreground ${header.column.columnDef.meta.align === 'right' ? 'flex-row-reverse' : ''}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon size={12} className={sorted ? 'text-foreground' : 'opacity-40'} aria-hidden="true" />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 1} className="py-8 text-center text-muted-foreground">
                  No rows match your search or filters.
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {hasMobileDetails && (
                    <TableCell className="w-10 md:hidden">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); row.toggleExpanded(); }}
                        aria-expanded={row.getIsExpanded()}
                        aria-label={row.getIsExpanded() ? 'Hide details' : 'Show details'}
                        className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      >
                        {row.getIsExpanded() ? <Minus size={14} /> : <Plus size={14} />}
                      </button>
                    </TableCell>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cellClass(cell.column)}>
                      {displayValue(cell.column.columnDef.meta, cell.getValue(), row.original)}
                    </TableCell>
                  ))}
                </TableRow>
                {hasMobileDetails && row.getIsExpanded() && (
                  <TableRow className="md:hidden bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={mobileKeys.size + 1} className="whitespace-normal">
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                        {row.getVisibleCells().filter((cell) => !mobileKeys.has(cell.column.id)).map((cell) => (
                          <Fragment key={cell.id}>
                            <dt className="text-muted-foreground">{cell.column.columnDef.meta.label}</dt>
                            <dd className="text-foreground wrap-break-word min-w-0">
                              {displayValue(cell.column.columnDef.meta, cell.getValue(), row.original)}
                            </dd>
                          </Fragment>
                        ))}
                      </dl>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
          {totalColumns.length > 0 && filteredCount > 0 && (
            <TableFooter className="sticky bottom-0 z-1 bg-muted">
              <TableRow>
                {hasMobileDetails && <TableCell className="md:hidden" />}
                {visibleColumns.map((c, i) => (
                  <TableCell key={c.id} className={`font-semibold ${cellClass(c)}`}>
                    {c.columnDef.meta.total ? formatTotal(c.columnDef.meta, totals[c.id]) : i === 0 ? 'Total' : ''}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </table>
      </div>

      {mobileExtraTotals.length > 0 && filteredCount > 0 && (
        <dl className="md:hidden grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border bg-muted/40 p-3 text-xs">
          {mobileExtraTotals.map((c) => (
            <div key={c.id} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{c.columnDef.meta.label}</dt>
              <dd className="font-semibold tabular-nums">{formatTotal(c.columnDef.meta, totals[c.id])}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          Showing {firstRow.toLocaleString('en-IN')}–{lastRow.toLocaleString('en-IN')} of {filteredCount.toLocaleString('en-IN')} rows
          {filteredCount !== rows.length && ` (filtered from ${rows.length.toLocaleString('en-IN')})`}
          {totalColumns.length > 0 && ` · totals cover all ${isFiltered ? 'filtered ' : ''}rows`}
        </p>
        <div className="flex items-center justify-between gap-2 md:justify-end">
          <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-28" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size} / page</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()} aria-label="First page">
              <ChevronsLeft size={14} />
            </Button>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft size={14} />
            </Button>
            <span className="px-2 tabular-nums">
              Page {table.getPageCount() ? pageIndex + 1 : 0} of {table.getPageCount()}
            </span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight size={14} />
            </Button>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => table.lastPage()} disabled={!table.getCanNextPage()} aria-label="Last page">
              <ChevronsRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
