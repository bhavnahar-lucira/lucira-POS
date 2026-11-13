'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useRepairDocuments, useBilledRepairOrders } from '@/hooks/repair/useRepairs';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import { Input } from '@/components/ui/input';
import { documentStatus, formatDate, formatINR, toneClass, locationLabel } from './repairFormat';
import RepairDocumentSheet from './RepairDocumentSheet';

export default function RepairDocumentList({ kind, emptyTitle, emptyDescription, showAmount = false }) {
  const { data, isLoading, isError, refetch } = useRepairDocuments(kind, { take: 500 });
  const billed = useBilledRepairOrders(kind === 'orders');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openId, setOpenId] = useState(null);

  const rows = useMemo(() => (data?.items ?? []).map((doc) => ({
    doc,
    status: documentStatus(kind, doc, billed.data?.get(doc.transaction_id)),
  })), [data, kind, billed.data]);
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status.label))], [rows]);
  const filtered = rows.filter(({ doc, status }) => {
    if (statusFilter !== 'all' && status.label !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [doc.document_no, doc.party_name, doc.mobile].some((v) => String(v ?? '').toLowerCase().includes(q));
  });

  if (isLoading) return <ListRowsSkeleton />;
  if (isError) return <ErrorState title="Couldn't load from OrnaVerse" onRetry={refetch} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search document no. or customer"
            className="h-11 pl-9"
          />
        </div>
        {statuses.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {['all', ...statuses].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`h-11 shrink-0 rounded-full border px-4 text-xs font-medium ${
                  statusFilter === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'
                }`}
              >
                {s === 'all' ? `All (${rows.length})` : s}
              </button>
            ))}
          </div>
        )}
      </div>

      {!filtered.length ? (
        <EmptyState title={rows.length ? 'Nothing matches this filter' : emptyTitle} description={rows.length ? undefined : emptyDescription} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {filtered.map(({ doc, status }) => (
            <button
              key={doc.transaction_id}
              type="button"
              onClick={() => setOpenId(doc.transaction_id)}
              className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3.5 text-left last:border-0 hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate text-sm font-medium text-foreground">{doc.document_no ?? `#${doc.transaction_id}`}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {doc.party_name ?? '—'}
                  {kind === 'orders' && ` · ${locationLabel(doc.repair_location_type)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(doc.document_date)} · {doc.pieces ?? 0} pc
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass(status.tone)}`}>{status.label}</span>
                  {showAmount && <span className="text-sm font-semibold tabular-nums text-foreground">{formatINR(Number(doc.net_amount) || (Number(doc.receipt_amount) || 0) + (Number(doc.balance_amount) || 0))}</span>}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      )}

      <RepairDocumentSheet
        kind={kind}
        id={openId}
        billedInvoiceNo={kind === 'orders' ? billed.data?.get(openId) : undefined}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
