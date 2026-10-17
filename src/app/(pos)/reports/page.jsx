'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { ArrowLeft, Download, Lock, X } from 'lucide-react';

import PillTabs from '@/components/shared/PillTabs';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import KPICard from '@/components/features/dashboard/KPICard';
import { selectActiveStoreId, selectActiveStoreName } from '@/store/slices/storeSlice';
import { todayDateString, formatDatePadded } from '@/lib/dateUtils';
import { formatAmount, formatAmountOrDash } from '@/lib/priceUtils';
import { downloadXlsx } from '@/lib/excelExport';

import { usePosDashboardReport } from '@/hooks/reports/usePosDashboardReport';
import { useCategoryWiseSalesReport } from '@/hooks/reports/useCategoryWiseSalesReport';
import { useSalesPersonWiseSalesReport } from '@/hooks/reports/useSalesPersonWiseSalesReport';
import { useSkuVelocityReport } from '@/hooks/reports/useSkuVelocityReport';
import { useOpenPosOrdersReport } from '@/hooks/reports/useOpenPosOrdersReport';
import { useAdhocReportsList } from '@/hooks/reports/useAdhocReportsList';
import { useAdhocReportRun } from '@/hooks/reports/useAdhocReportRun';

function daysAgoDateString(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const BASE_TABS = [
  { key: 'summary',     label: 'Sales Summary' },
  { key: 'category',    label: 'Category Wise' },
  { key: 'salesperson', label: 'Salesperson Wise' },
  { key: 'velocity',    label: 'SKU Velocity' },
  { key: 'openOrders',  label: 'Open Orders' },
];
const ADHOC_TAB = { key: 'adhoc', label: 'Ad-hoc Reports' };

// Shared table shell for the four tabular reports — loading/error/empty
// states match this app's existing ListRowsSkeleton/ErrorState/EmptyState
// conventions; the column-driven body is local to this page since no
// generic multi-column DataTable exists elsewhere in the codebase yet.
function ReportTable({ columns, rows, isLoading, isError, onRetry, emptyMessage, getRowKey }) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
            {columns.map((c) => <Skeleton key={c.key} className="h-4 flex-1" />)}
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState title="Failed to load this report." onRetry={onRetry} />;
  }

  if (!rows.length) {
    return <EmptyState title={emptyMessage ?? 'No records for this range.'} />;
  }

  // A bounded, self-scrolling box (not the whole page). Deliberately NOT the
  // shared Table primitive here — its own wrapper div sets overflow-x-auto,
  // which forces overflow-y to also compute as 'auto' (browsers won't allow
  // one axis visible when the other isn't). Being nearer to the header cells
  // than this div, THAT wrapper — not this one — would win as the sticky
  // positioning anchor, no matter what's set here. Scrolling both axes on
  // this one div directly (never visible/non-visible mixed, so no override)
  // keeps this the only scroll container, and the header sticks correctly.
  return (
    <div className="rounded-xl border border-border max-h-[65vh] overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={`sticky top-0 z-[1] bg-muted/70 backdrop-blur-sm ${c.align === 'right' ? 'text-right' : ''}`}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={getRowKey ? getRowKey(row, i) : i}>
              {columns.map((c) => (
                <TableCell key={c.key} className={c.align === 'right' ? 'text-right tabular-nums' : undefined}>
                  {c.format ? c.format(row[c.key], row) : row[c.key] ?? '—'}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  );
}

// OrnaVerse's own DataType strings, confirmed live: 'int', 'number', 'string',
// 'date', 'enum' (paired with EnumTexts). Shared by the on-screen table and
// the export button's enum-decoding, so neither can drift from the other.
function getAdhocColumnConfig(info) {
  const isNumeric = info.DataType === 'int' || info.DataType === 'number';
  const isDate = info.DataType === 'date';
  const isEnum = info.DataType === 'enum' && !!info.EnumTexts;

  return {
    key: info.Name,
    label: info.Title,
    align: isNumeric ? 'right' : undefined,
    format: isEnum
      ? (v) => (v == null ? '—' : info.EnumTexts[String(v)] ?? v)
      : isDate
        ? (v) => (v ? formatDatePadded(v) : '—')
        : isNumeric
          ? (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'))
          : undefined,
  };
}

// Browse + run one of OrnaVerse's 111 user-built ad-hoc reports. Unlike the
// curated tabs, these aren't store/date-scoped — Run is called with an empty
// FilterOverrides, same as OrnaVerse's own default view.
function AdhocReportsTab({ reportsList, selectedReportId, selectedReport, onSelectReport, runReport }) {
  const [search, setSearch] = useState('');

  if (!selectedReportId) {
    const trimmed = search.trim().toLowerCase();
    const filtered = trimmed
      ? reportsList.reports.filter((r) =>
          r.Name.toLowerCase().includes(trimmed) || r.Description?.toLowerCase().includes(trimmed))
      : reportsList.reports;

    if (reportsList.isPermissionError) {
      return (
        <ErrorState
          icon={Lock}
          title="You don't have permission to view ad-hoc reports."
          description="Ask an administrator to grant access to the Reporting module on OrnaVerse."
        />
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <Input
          type="text"
          placeholder="Search reports by name or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search ad-hoc reports"
        />

        {reportsList.isLoading ? (
          <div className="rounded-xl border border-border overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-3 border-b border-border last:border-0">
                <Skeleton className="h-4 w-1/3 mb-2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : reportsList.isError ? (
          <ErrorState title="Failed to load ad-hoc reports." onRetry={reportsList.refetch} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matching reports." />
        ) : (
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {filtered.map((r) => (
              <button
                key={r.AdhocReportId}
                type="button"
                onClick={() => onSelectReport(r.AdhocReportId)}
                className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.Name}</p>
                  {r.Description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.Description}</p>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                  {r.ChartType}
                </span>
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {reportsList.reports.length} report{reportsList.reports.length !== 1 ? 's' : ''} available
        </p>
      </div>
    );
  }

  const columns = runReport.columns.map(getAdhocColumnConfig);

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onSelectReport(null)}
        className="self-end gap-1.5"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to reports
      </Button>

      <div>
        <p className="text-sm font-semibold text-foreground">{selectedReport?.Name}</p>
        {selectedReport?.Description && (
          <p className="text-xs text-muted-foreground mt-0.5">{selectedReport.Description}</p>
        )}
      </div>

      <ReportTable
        columns={columns}
        rows={runReport.rows}
        isLoading={runReport.isLoading}
        isError={runReport.isError}
        onRetry={runReport.refetch}
        getRowKey={(row, i) => i}
        emptyMessage="This report returned no rows."
      />
    </div>
  );
}

// Shared with ReportsPage's export button so the on-screen KPIs and the
// exported CSV can never drift out of sync.
function buildSummaryKpis(data) {
  return [
    { label: 'Total Sales',       value: data.total_sales_amount },
    { label: 'Total Order Amount', value: data.total_order_amount },
    { label: 'MTO Orders',        value: data.mto_orders },
    { label: 'MTO Sales',         value: data.mto_sales },
    { label: 'RTS + MTO',         value: data.rts_and_mto },
    { label: 'Returns',           value: data.returns },
    { label: 'Pending MTO',       value: data.pending_mto },
    { label: 'Total URD',         value: data.total_urd },
    { label: 'Scheme',            value: data.scheme },
  ];
}

function SalesSummaryTab({ data, isLoading, isError, onRetry }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => <KPICard key={i} isLoading />)}
      </div>
    );
  }

  if (isError) return <ErrorState title="Failed to load the sales summary." onRetry={onRetry} />;
  if (!data) return <EmptyState title="No summary for this range." />;

  const kpis = buildSummaryKpis(data);
  const collections = (data.total_collections ?? []).filter((c) => c.sales);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {kpis.map((k) => (
          <KPICard key={k.label} label={k.label} value={formatAmount(k.value)} />
        ))}
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-semibold text-foreground mb-3">Payment Collections</p>
        {collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No collections in this range.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {collections.map((c) => (
              <div key={c.mode_type} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{c.mode_type}</span>
                <span className="font-medium tabular-nums">{formatAmount(c.sales)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const CATEGORY_COLUMNS = [
  { key: 'type_name',       label: 'Category' },
  { key: 'total_pieces',    label: 'Pieces',     align: 'right' },
  { key: 'total_weight',    label: 'Weight (g)', align: 'right' },
  { key: 'total_sub_total', label: 'Subtotal',   align: 'right', format: formatAmountOrDash },
  { key: 'total_tax_amount', label: 'Tax',        align: 'right', format: formatAmountOrDash },
  { key: 'total_Net_Amount', label: 'Net Amount', align: 'right', format: formatAmountOrDash },
];

const SALESPERSON_COLUMNS = [
  { key: 'employee_name', label: 'Sales Person' },
  { key: 'employee_code', label: 'Code' },
  { key: 'pieces',        label: 'Pieces',     align: 'right' },
  { key: 'weight',        label: 'Weight (g)', align: 'right' },
  { key: 'sub_total',     label: 'Subtotal',   align: 'right', format: formatAmountOrDash },
  { key: 'net_amount',    label: 'Net Amount', align: 'right', format: formatAmountOrDash },
];

const VELOCITY_COLUMNS = [
  { key: 'ItemCode',           label: 'Item Code' },
  { key: 'ItemGroup',          label: 'Group' },
  { key: 'TotalQuantity',      label: 'Qty Sold',  align: 'right' },
  { key: 'TotalValue',         label: 'Value',     align: 'right', format: formatAmountOrDash },
  { key: 'NormalizedVelocity', label: 'Velocity',  align: 'right', format: (v) => (v == null ? '—' : v.toFixed(2)) },
  { key: 'VelocityRank',       label: 'Rank',      align: 'right' },
  { key: 'Recommendation',     label: 'Recommendation' },
];

const OPEN_ORDERS_COLUMNS = [
  { key: 'document_no',     label: 'Order No.' },
  { key: 'document_date',   label: 'Date',      format: formatDatePadded },
  { key: 'party_name',      label: 'Customer' },
  { key: 'net_amount',      label: 'Net Amount', align: 'right', format: formatAmountOrDash },
  { key: 'receipt_amount',  label: 'Received',   align: 'right', format: formatAmountOrDash },
  { key: 'balance_amount',  label: 'Balance',    align: 'right', format: formatAmountOrDash },
];

export default function ReportsPage() {
  const companyId   = useSelector(selectActiveStoreId);
  const companyName = useSelector(selectActiveStoreName);

  const [activeTab, setActiveTab] = useState('summary');
  const [fromDate, setFromDate] = useState(() => daysAgoDateString(30));
  const [toDate, setToDate]     = useState(() => todayDateString());
  const hasCustomRange = fromDate !== daysAgoDateString(30) || toDate !== todayDateString();

  const handleResetRange = () => {
    setFromDate(daysAgoDateString(30));
    setToDate(todayDateString());
  };

  const range = { companyId, fromDate, toDate };

  const summaryReport     = usePosDashboardReport(range);
  const categoryReport    = useCategoryWiseSalesReport(range);
  const salesPersonReport = useSalesPersonWiseSalesReport(range);
  const velocityReport    = useSkuVelocityReport(range);
  const openOrdersReport  = useOpenPosOrdersReport(range);

  const [selectedAdhocReportId, setSelectedAdhocReportId] = useState(null);
  const adhocReportsList = useAdhocReportsList();
  const adhocReportRun   = useAdhocReportRun(selectedAdhocReportId);
  const selectedAdhocReport = adhocReportsList.reports.find((r) => r.AdhocReportId === selectedAdhocReportId) ?? null;
  // Hide the tab rather than let a restricted user click into a dead end —
  // confirmed live 2026-10-16: OrnaVerse's own AdhocReport/List 400s with
  // Error.Code "AccessDenied" for an account with no Reporting:AdhocReports:
  // View permission, surfaced here via isPermissionError.
  const TABS = adhocReportsList.isPermissionError ? BASE_TABS : [...BASE_TABS, ADHOC_TAB];

  const TAB_REPORTS = {
    category:    { columns: CATEGORY_COLUMNS,    rows: categoryReport.rows,    filenamePrefix: 'category-wise-sales' },
    salesperson: { columns: SALESPERSON_COLUMNS, rows: salesPersonReport.rows, filenamePrefix: 'salesperson-wise-sales' },
    velocity:    { columns: VELOCITY_COLUMNS,    rows: velocityReport.rows,    filenamePrefix: 'sku-velocity' },
    openOrders:  { columns: OPEN_ORDERS_COLUMNS, rows: openOrdersReport.rows,  filenamePrefix: 'open-pos-orders' },
  };

  const canExport = activeTab === 'summary'
    ? !!summaryReport.data
    : activeTab === 'adhoc'
      ? adhocReportRun.rows.length > 0
      : (TAB_REPORTS[activeTab]?.rows.length ?? 0) > 0;

  const handleExport = () => {
    if (activeTab === 'summary') {
      if (!summaryReport.data) return;
      downloadXlsx(`sales-summary_${fromDate}_to_${toDate}.xlsx`, [
        {
          name: 'Summary',
          columns: [{ key: 'label', label: 'Metric' }, { key: 'value', label: 'Value' }],
          rows: buildSummaryKpis(summaryReport.data),
        },
        {
          name: 'Payment Collections',
          columns: [{ key: 'mode_type', label: 'Payment Mode' }, { key: 'sales', label: 'Amount' }],
          rows: (summaryReport.data.total_collections ?? []).filter((c) => c.sales),
        },
      ]);
      return;
    }
    if (activeTab === 'adhoc') {
      if (!selectedAdhocReport || adhocReportRun.rows.length === 0) return;
      const exportColumns = adhocReportRun.columns.map((info) => ({ key: info.Name, label: info.Title }));
      const exportRows = adhocReportRun.rows.map((row) => {
        const out = {};
        adhocReportRun.columns.forEach((info) => {
          const raw = row[info.Name];
          out[info.Name] = (info.DataType === 'enum' && info.EnumTexts) ? (info.EnumTexts[String(raw)] ?? raw) : raw;
        });
        return out;
      });
      const safeName = selectedAdhocReport.Name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      downloadXlsx(`${safeName}.xlsx`, [{ name: selectedAdhocReport.Name, columns: exportColumns, rows: exportRows }]);
      return;
    }
    const { columns, rows, filenamePrefix } = TAB_REPORTS[activeTab];
    downloadXlsx(`${filenamePrefix}_${fromDate}_to_${toDate}.xlsx`, [{ name: 'Report', columns, rows }]);
  };

  return (
    <div className="flex flex-col gap-4 w-full p-4 md:p-6">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-2 border-b border-border bg-background px-4 pt-4 pb-3 md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
        <p className="text-sm text-muted-foreground">
          {companyName ? `For ${companyName}` : 'For the active store'}
        </p>

        {companyId && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {activeTab === 'adhoc' ? (
                <p className="text-xs text-muted-foreground">
                  Ad-hoc reports query live across all stores and dates — not scoped to a range.
                </p>
              ) : (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Input
                    type="date"
                    value={fromDate}
                    max={todayDateString()}
                    onChange={(e) => setFromDate(e.target.value)}
                    aria-label="From date"
                    className="flex-1 sm:w-37.5 sm:flex-none"
                  />
                  <span className="text-muted-foreground text-sm shrink-0">to</span>
                  <Input
                    type="date"
                    value={toDate}
                    max={todayDateString()}
                    onChange={(e) => setToDate(e.target.value)}
                    aria-label="To date"
                    className="flex-1 sm:w-37.5 sm:flex-none"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 sm:ml-auto">
                {activeTab !== 'adhoc' && hasCustomRange && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetRange}
                    className="gap-1.5"
                    aria-label="Reset date range"
                  >
                    <X size={14} aria-hidden="true" />
                    Reset
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={!canExport}
                  className="gap-1.5"
                >
                  <Download size={14} aria-hidden="true" />
                  Export Excel
                </Button>
              </div>
            </div>

            <PillTabs tabs={TABS} value={activeTab} onChange={setActiveTab} scrollable variant="chip" />
          </>
        )}
      </div>

      {!companyId ? (
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to view reports.</p>
        </div>
      ) : (
        <>
          {activeTab === 'summary' && (
            <SalesSummaryTab
              data={summaryReport.data}
              isLoading={summaryReport.isLoading}
              isError={summaryReport.isError}
              onRetry={summaryReport.refetch}
            />
          )}

          {activeTab === 'category' && (
            <ReportTable
              columns={CATEGORY_COLUMNS}
              rows={categoryReport.rows}
              isLoading={categoryReport.isLoading}
              isError={categoryReport.isError}
              onRetry={categoryReport.refetch}
              getRowKey={(row) => row.type_name}
              emptyMessage="No category sales in this range."
            />
          )}

          {activeTab === 'salesperson' && (
            <ReportTable
              columns={SALESPERSON_COLUMNS}
              rows={salesPersonReport.rows}
              isLoading={salesPersonReport.isLoading}
              isError={salesPersonReport.isError}
              onRetry={salesPersonReport.refetch}
              getRowKey={(row, i) => row.transaction_item_id ?? i}
              emptyMessage="No salesperson sales in this range."
            />
          )}

          {activeTab === 'velocity' && (
            <ReportTable
              columns={VELOCITY_COLUMNS}
              rows={velocityReport.rows}
              isLoading={velocityReport.isLoading}
              isError={velocityReport.isError}
              onRetry={velocityReport.refetch}
              getRowKey={(row) => row.performance_id}
              emptyMessage="No SKU velocity data in this range."
            />
          )}

          {activeTab === 'openOrders' && (
            <ReportTable
              columns={OPEN_ORDERS_COLUMNS}
              rows={openOrdersReport.rows}
              isLoading={openOrdersReport.isLoading}
              isError={openOrdersReport.isError}
              onRetry={openOrdersReport.refetch}
              getRowKey={(row, i) => i} // one Entity per order LINE, not per order — document_no repeats
              emptyMessage="No open orders in this range."
            />
          )}

          {activeTab === 'adhoc' && (
            <AdhocReportsTab
              reportsList={adhocReportsList}
              selectedReportId={selectedAdhocReportId}
              selectedReport={selectedAdhocReport}
              onSelectReport={setSelectedAdhocReportId}
              runReport={adhocReportRun}
            />
          )}
        </>
      )}
    </div>
  );
}
