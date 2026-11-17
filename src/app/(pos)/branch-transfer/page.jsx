'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Truck, PackageCheck, Boxes, Plus, X, ChevronRight, RefreshCw, Trash2, Check, Search, ShieldCheck,
} from 'lucide-react';

import {
  useMyCompany, useDestinations, useFreights, useCanPostAllocation, useAllocationPermissions,
  useBranchOuts, useBranchIns, useStockAllocations,
  useBranchOutDetail, useBranchInDetail, useStockAllocationDetail,
  usePostBranchOut, useCancelBranchOut, useAuthorizeBranchIn, getErrorMessage,
  usePostAllocation, useCancelAllocation, useUpdateAllocation, logTransferEvent, useTransferEvents, useSentTransferReceipts,
  useCancelledAllocations,
} from '@/hooks/branchTransfer/useBranchTransfer';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import {
  getParty, getCompanyByParty, getCompanyLocations, buildPricingContext,
  listTransferStock, priceTransferItems, transferTotals, createBranchOut, postBranchOut, getLinkedBranchIn, retrieveBranchOut,
} from '@/services/branchTransferService';
import {
  listPosOrderLines, listSalesOrderLines, buildDemandLines, listAllocatableStock,
  priceAllocatedStock, allocationTotals, createStockAllocation,
} from '@/services/stockAllocationService';
import APP_CONFIG from '@/constants/appConfig';
import { formatDatePadded } from '@/lib/dateUtils';
import { formatAmountOrDash } from '@/lib/priceUtils';

import PillTabs from '@/components/shared/PillTabs';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import PageLoader from '@/components/shared/PageLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

const formatINR = formatAmountOrDash;
const formatDate = formatDatePadded;
const DOCS = APP_CONFIG.DOCUMENT_TYPES;
const LIST_LIMIT = 60;

const TABS = [
  { key: 'send', label: 'Send', icon: Truck },
  { key: 'receive', label: 'Receive', icon: PackageCheck },
  { key: 'allocation', label: 'Stock Allocation', icon: Boxes },
];

const STOCK_CATEGORIES = [
  { id: 11, label: 'Jewellery' },
  { id: 12, label: 'Metal' },
  { id: 13, label: 'Stone' },
  { id: 14, label: 'Others' },
];

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const stockKey = (r) => `${r.sku ?? ''}#${r.item_line_no ?? ''}#${r.item_id ?? ''}`;

function Chip({ tone = 'muted', children }) {
  const cls = {
    muted: 'bg-muted text-muted-foreground',
    amber: 'bg-status-made-order/15 text-status-made-order',
    green: 'bg-status-in-stock/15 text-status-in-stock',
    red: 'bg-destructive/15 text-destructive',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

function DocStatusChip({ status }) {
  if (status === 1) return <Chip tone="green">Posted</Chip>;
  if (status === 2) return <Chip tone="red">Cancelled</Chip>;
  return <Chip>Draft</Chip>;
}

function DocRow({ title, subtitle, meta, amount, chips, onSelect }) {
  return (
    <button type="button" onClick={onSelect} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted/30 active:bg-muted/50 transition-colors text-left">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          {chips}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {amount != null && <p className="text-sm font-semibold text-foreground tabular-nums">{formatINR(amount)}</p>}
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );
}

function ListShell({ isLoading, isError, isFetching, refetch, rows, emptyIcon, emptyTitle, emptyHint, children }) {
  if (isLoading) return <ListRowsSkeleton rows={5} lines={3} />;
  if (isError) return <ErrorState className="py-10" title="Couldn't load this list." onRetry={refetch} />;
  if (!rows.length) return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyHint} />;
  return (
    <>
      {isFetching && <div className="flex justify-center py-1"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" /></div>}
      <div className="rounded-xl border border-border overflow-hidden">{children}</div>
    </>
  );
}

function LinesTable({ lines, onRemove }) {
  return (
    <div className="rounded-xl border border-border divide-y divide-border">
      {lines.map((l, i) => (
        <div key={`${stockKey(l)}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{l.item_code ?? l.sku}</p>
            <p className="truncate text-xs text-muted-foreground">
              {l.sku || '—'} · {l.pieces ?? 0} pc · {Number(l.weight ?? 0).toFixed(3)} g{l.location_name ? ` · ${l.location_name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-semibold tabular-nums">{formatINR(l.net_amount)}</span>
            {onRemove && (
              <button type="button" aria-label={`Remove ${l.item_code ?? l.sku}`} onClick={() => onRemove(i)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TotalsBar({ totals }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm sm:grid-cols-4">
      <span className="text-muted-foreground">Pieces</span><span className="text-right tabular-nums sm:text-left">{totals.pieces}</span>
      <span className="text-muted-foreground">Gr. weight</span><span className="text-right tabular-nums sm:text-left">{totals.weight.toFixed(3)} g</span>
      <span className="text-muted-foreground">Tax</span><span className="text-right tabular-nums sm:text-left">{formatINR(totals.tax_amount)}</span>
      <span className="font-medium">Net amount</span><span className="text-right font-semibold tabular-nums sm:text-left">{formatINR(totals.net_amount)}</span>
    </div>
  );
}

// OrnaVerse's stamps have no zone marker but differ: posting_date is IST, authorized_date is UTC
// (e.g. HO-BIT-11-26-2 posted 12:11 IST, authorized_date 06:41 — the same moment). creation_date carries "Z".
const parseOvTime = (v, zone = 'ist') => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(v);
  const d = new Date(hasZone ? v : `${v}${zone === 'utc' ? 'Z' : '+05:30'}`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const authorisedAt = (r) => parseOvTime(r?.authorized_date, 'utc');
const formatDateTime = (v) => {
  const d = v instanceof Date ? v : parseOvTime(v);
  return d ? d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};

const EVENT_LABELS = {
  created: 'Created in POS', posted: 'Posted from POS', cancelled: 'Cancelled', authorised: 'Received & authorised from POS', updated: 'Updated in POS',
};

/** Merges OrnaVerse's own stamps with the POS activity log into one dated history, oldest first. */
function Timeline({ steps, events = [] }) {
  // Steps stay in their natural order (older OrnaVerse documents lack some stamps); POS log entries slot in by time.
  const items = steps.filter(Boolean).map((s) => ({ ...s, time: s.at ? parseOvTime(s.at) : null }));
  for (const e of events) {
    const entry = { label: EVENT_LABELS[e.action] ?? e.action, time: new Date(e.at), by: `${e.user}${e.store_code ? ` (${e.store_code})` : ''}`, tone: e.action === 'cancelled' ? 'red' : 'muted' };
    const at = items.findIndex((it) => it.pending || (it.time && it.time > entry.time));
    items.splice(at === -1 ? items.length : at, 0, entry);
  }
  const dot = { green: 'bg-status-in-stock', amber: 'bg-status-made-order', red: 'bg-destructive', muted: 'bg-primary' };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Activity</p>
      <ol className="flex flex-col gap-3 border-l border-border pl-4">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="relative text-sm">
            <span className={`absolute -left-5.25 top-1.5 size-2 rounded-full ${dot[it.tone ?? 'muted']}`} aria-hidden="true" />
            <p className={`font-medium ${it.pending ? 'text-status-made-order' : 'text-foreground'}`}>{it.label}</p>
            <p className="text-xs text-muted-foreground">
              {it.time ? (it.dateOnly ? formatDate(it.time) : formatDateTime(it.time)) : it.pending ? 'Waiting' : '—'}{it.by ? ` · ${it.by}` : ''}
            </p>
            {it.note && <p className="text-xs text-muted-foreground">{it.note}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

const STATUS_FILTERS = {
  send: [
    { key: 'all', label: 'All' }, { key: 'draft', label: 'Drafts' }, { key: 'transit', label: 'In transit' },
    { key: 'received', label: 'Received' }, { key: 'cancelled', label: 'Cancelled' },
  ],
  receive: [
    { key: 'all', label: 'All' }, { key: 'awaiting', label: 'Awaiting authorisation' }, { key: 'received', label: 'Received' }, { key: 'cancelled', label: 'Cancelled' },
  ],
  allocation: [
    { key: 'all', label: 'All' }, { key: 'draft', label: 'Drafts' }, { key: 'posted', label: 'Posted' }, { key: 'cancelled', label: 'Cancelled' },
  ],
};

function ListToolbar({ filters, value, onChange, search, onSearch, counts }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
        {filters.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={value === f.key} onClick={() => onChange(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${value === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {f.label}{counts?.[f.key] != null ? ` (${counts[f.key]})` : ''}
          </button>
        ))}
      </div>
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search document no. / branch" className="h-10 pl-9" aria-label="Search" />
      </div>
    </div>
  );
}

const matchesSearch = (r, q) => !q || [r.document_no, r.party_display_name, r.party_name, r.narration, r.remark]
  .some((v) => String(v ?? '').toLowerCase().includes(q.toLowerCase()));

function FieldSelect({ label, value, onChange, options, placeholder, disabled, required }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Select value={value != null && value !== '' ? String(value) : ''} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
        <SelectTrigger className="h-11 w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Send (Branch Out) ───────────────────────────────────────────────────

function StockPicker({ salePartyId, excludeKeys, onAdd, isAdding }) {
  const [category, setCategory] = useState(11);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search.trim(), 400);
  const [picked, setPicked] = useState([]);
  const stock = useQuery({
    queryKey: ['branch-transfer', 'stock', salePartyId, category, debounced],
    queryFn: () => listTransferStock({ salePartyId, baseItemId: category, search: debounced }),
    enabled: !!salePartyId,
    staleTime: 0,
    gcTime: 0,
  });
  const rows = (stock.data ?? []).filter((r) => !excludeKeys.has(stockKey(r)));
  const visible = rows.slice(0, LIST_LIMIT);
  const toggle = (r) => setPicked((p) => (p.some((x) => stockKey(x) === stockKey(r)) ? p.filter((x) => stockKey(x) !== stockKey(r)) : [...p, r]));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Stock category">
        {STOCK_CATEGORIES.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={category === c.id} onClick={() => { setCategory(c.id); setPicked([]); }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${category === c.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, item code or certificate" className="h-10 pl-9" aria-label="Search stock" />
      </div>
      {stock.isLoading ? <InlineLoader className="py-4" label="Loading stock…" /> : stock.isError ? (
        <ErrorState className="py-4" title="Couldn't load stock." onRetry={stock.refetch} />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No stock found.</p>
      ) : (
        <div className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {visible.map((r) => {
            const on = picked.some((x) => stockKey(x) === stockKey(r));
            return (
              <button key={stockKey(r)} type="button" onClick={() => toggle(r)} aria-pressed={on}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-left ${on ? 'bg-primary/5' : 'hover:bg-muted/40'}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{r.item_code}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.sku || '—'} · {r.location_name} · {r.pieces} pc · {Number(r.weight ?? 0).toFixed(3)} g{r.certificate_no ? ` · ${r.certificate_no}` : ''}
                  </span>
                </span>
                {on && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
      {rows.length > LIST_LIMIT && <p className="text-xs text-muted-foreground">Showing {LIST_LIMIT} of {rows.length} — search to narrow down.</p>}
      <Button type="button" disabled={!picked.length || isAdding} onClick={async () => { await onAdd(picked); setPicked([]); }}>
        {isAdding ? 'Adding…' : `Add ${picked.length || ''} item${picked.length === 1 ? '' : 's'}`.replace('  ', ' ')}
      </Button>
    </div>
  );
}

function NewBranchOutForm({ onDone }) {
  const queryClient = useQueryClient();
  const { companyId, company } = useMyCompany();
  const headerConfig = useOrderHeaderConfig(DOCS.BRANCH_OUT);
  const { destinations, isLoading: destLoading } = useDestinations(companyId, company?.party_id);
  const freights = useFreights();

  const [partyId, setPartyId] = useState(null);
  const [locationId, setLocationId] = useState(null);
  const [freightId, setFreightId] = useState(null);
  const [awbNo, setAwbNo] = useState('');
  const [remark, setRemark] = useState('');
  const [lines, setLines] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const dest = useQuery({
    queryKey: ['branch-transfer', 'dest-details', partyId],
    queryFn: async () => {
      const [party, destCompany] = await Promise.all([getParty(partyId), getCompanyByParty(partyId)]);
      const locations = destCompany ? await getCompanyLocations(destCompany.company_id) : [];
      return { party, destCompany, locations };
    },
    enabled: !!partyId,
    staleTime: 0,
  });
  const party = dest.data?.party ?? null;
  const locations = dest.data?.locations ?? [];
  const context = useMemo(
    () => (party ? buildPricingContext({ party, myCompany: company, docAllowsTax: headerConfig.isTaxApplicable }) : null),
    [party, company, headerConfig.isTaxApplicable],
  );
  const address = party
    ? [party.address, party.address_1, party.city_name, party.state_name, party.pin_code, party.country_code].filter(Boolean).join(',')
    : '';
  const totals = transferTotals(lines, context?.is_tax_applicable);
  const locked = lines.length > 0;

  const chooseParty = (id) => {
    setPartyId(id);
    setLocationId(null);
  };
  if (!locationId && locations.length) {
    const fg = locations.find((l) => l.location_id === 1) ?? locations[0];
    setLocationId(fg.location_id);
  }

  const addItems = async (picked) => {
    if (!context) return;
    setIsAdding(true);
    try {
      const priced = await priceTransferItems({ items: picked, context });
      if (!priced.length) throw new Error('Could not price the selected items.');
      setLines((prev) => [...prev, ...priced]);
      setShowPicker(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  };

  const save = async (andPost) => {
    if (!partyId || !party) return toast.error('Select the destination branch.');
    if (!locationId) return toast.error('Select the location.');
    if (!lines.length) return toast.error('Add at least one item.');
    if (!headerConfig.isReady) return toast.error(headerConfig.isConfigMissing ? "Branch transfer isn't set up for this store in OrnaVerse." : 'Store configuration is still loading — try again in a moment.');
    setIsSaving(true);
    try {
      const res = await createBranchOut({ companyId, headerConfig, party, context, locationId, freightId, awbNo, remark, address, lines });
      if (!res?.EntityId) throw new Error('Creation failed — no document was returned.');
      logTransferEvent({ doc_type: 'branch_out', transaction_id: res.EntityId, action: 'created' });
      if (andPost && !headerConfig.autoPosting) await postBranchOut(res.EntityId);
      if (andPost || headerConfig.autoPosting) logTransferEvent({ doc_type: 'branch_out', transaction_id: res.EntityId, action: 'posted' });
      toast.success(andPost ? 'Transfer posted — it is now in transit to the destination.' : 'Transfer saved as draft.');
      queryClient.invalidateQueries({ queryKey: ['branch-transfer'] });
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldSelect label="Transfer to" required value={partyId} onChange={chooseParty} disabled={locked || destLoading}
          placeholder={destLoading ? 'Loading branches…' : 'Select destination branch'}
          options={destinations.map((d) => ({ value: d.party_id, label: d.party_name }))} />
        <FieldSelect label="Location" required value={locationId} onChange={setLocationId} disabled={locked || !partyId || dest.isLoading}
          placeholder={dest.isLoading ? 'Loading…' : 'Select location'}
          options={locations.map((l) => ({ value: l.location_id, label: l.location_name }))} />
        <FieldSelect label="Freight" value={freightId} onChange={setFreightId} placeholder="Select freight (optional)"
          options={freights.map((f) => ({ value: f.freight_id, label: f.freight_code ?? f.freight_name }))} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bt-awb">AWB No</Label>
          <Input id="bt-awb" value={awbNo} onChange={(e) => setAwbNo(e.target.value)} className="h-11" />
        </div>
      </div>
      {address && <p className="text-xs text-muted-foreground">{address}</p>}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Items <span className="text-destructive">*</span></Label>
          <Button type="button" size="sm" variant="outline" disabled={!context} onClick={() => setShowPicker((v) => !v)}>
            {showPicker ? <><X className="h-3.5 w-3.5" /> Close</> : <><Plus className="h-3.5 w-3.5" /> Add from stock</>}
          </Button>
        </div>
        {!partyId && <p className="text-xs text-muted-foreground">Select the destination first — pricing depends on it.</p>}
        {showPicker && context && (
          <StockPicker salePartyId={partyId} excludeKeys={new Set(lines.map(stockKey))} onAdd={addItems} isAdding={isAdding} />
        )}
        {lines.length > 0 && <LinesTable lines={lines} onRemove={(i) => setLines((p) => p.filter((_, j) => j !== i))} />}
      </div>

      {lines.length > 0 && <TotalsBar totals={totals} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bt-remark">Remark</Label>
        <Textarea id="bt-remark" value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={isSaving || headerConfig.isLoading} onClick={() => save(false)}>Save as Draft</Button>
        <Button type="button" disabled={isSaving || headerConfig.isLoading} onClick={() => save(true)}>{isSaving ? 'Saving…' : 'Save & Post'}</Button>
      </div>
    </div>
  );
}

function BranchOutDetail({ id, onClose }) {
  const { entity, isLoading, isError, refetch } = useBranchOutDetail(id);
  const linked = useQuery({ queryKey: ['branch-transfer', 'linked-in', id], queryFn: () => getLinkedBranchIn(id), enabled: entity?.document_status === 1, staleTime: 0 });
  const receipt = linked.data;
  const postDoc = usePostBranchOut();
  const cancelDoc = useCancelBranchOut();
  const [confirm, setConfirm] = useState(null);
  const outEvents = useTransferEvents('branch_out', [id]);
  const inEvents = useTransferEvents('branch_in', [receipt?.transaction_id]);
  const docNo = entity?.document_no ?? null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{entity?.document_no ?? 'Branch transfer'}</SheetTitle>
          <SheetDescription>{entity ? `To ${entity.party_display_name ?? entity.party_name} · ${formatDate(entity.document_date)}` : ' '}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {isLoading ? <InlineLoader label="Loading…" /> : isError || !entity ? <ErrorState title="Couldn't load this transfer." onRetry={refetch} /> : (
            <>
              <div className="flex flex-wrap gap-2">
                <DocStatusChip status={entity.document_status} />
                {entity.document_status === 1 && receipt && (receipt.authorize
                  ? <Chip tone="green">Received at {receipt.document_no}</Chip>
                  : <Chip tone="amber">In transit · {receipt.document_no} awaiting authorisation</Chip>)}
              </div>
              {entity.remark && <p className="text-sm text-muted-foreground">{entity.remark}</p>}
              {(entity.awb_no || entity.freight_code) && <p className="text-xs text-muted-foreground">Freight {entity.freight_code ?? '—'} · AWB {entity.awb_no || '—'}</p>}
              <LinesTable lines={entity.line_items ?? []} />
              <TotalsBar totals={transferTotals(entity.line_items ?? [], entity.is_tax_applicable)} />
              <Timeline
                events={[...outEvents.filter((e) => e.action !== 'created' && e.action !== 'posted'), ...inEvents.filter((e) => e.action !== 'authorised')]}
                steps={[
                  { label: 'Created', at: entity.creation_date, by: entity.username },
                  entity.document_status !== 0 && entity.posting_date && { label: 'Posted · sent', at: entity.posting_date, by: entity.posted_by_name, tone: 'green' },
                  entity.document_status === 0 && { label: 'Draft · not posted yet', pending: true, tone: 'amber' },
                  receipt && { label: `Receipt ${receipt.document_no} created at ${receipt.company_code ?? 'destination'}`, at: receipt.creation_date, tone: 'muted' },
                  receipt && (receipt.authorize
                    ? { label: `Received & authorised at ${receipt.company_code ?? 'destination'}`, at: authorisedAt(receipt), by: receipt.authorized_by_name, tone: 'green' }
                    : receipt.document_status === 2
                      ? { label: `Receipt ${receipt.document_no} cancelled`, tone: 'red' }
                      : { label: `In transit · awaiting authorisation at ${receipt.company_code ?? 'destination'}`, pending: true, tone: 'amber' }),
                ]}
              />
              <div className="flex flex-col gap-2">
                {entity.document_status === 0 && (
                  <Button disabled={postDoc.isPending} onClick={() => postDoc.mutate({ id, documentNo: docNo }, { onSuccess: () => refetch() })}>
                    {postDoc.isPending ? 'Posting…' : 'Post transfer'}
                  </Button>
                )}
                {entity.document_status !== 2 && !receipt?.authorize && !linked.isLoading && (
                  <Button variant="outline" disabled={cancelDoc.isPending} onClick={() => setConfirm(true)}>Cancel transfer</Button>
                )}
              </div>
            </>
          )}
        </div>
        <ConfirmDialog isOpen={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title="Cancel this transfer?"
          description="The stock goes back to this store. This can't be undone." confirmLabel="Cancel transfer"
          onConfirm={() => cancelDoc.mutate({ id, documentNo: docNo }, { onSuccess: () => { setConfirm(null); refetch(); } })} />
      </SheetContent>
    </Sheet>
  );
}

const sendStatus = (r, receipt) => {
  if (r.document_status === 2) return 'cancelled';
  if (r.document_status === 0) return 'draft';
  if (receipt?.authorize) return 'received';
  return 'transit';
};

function SendStatusChips({ row, receipt }) {
  const st = sendStatus(row, receipt);
  if (st === 'cancelled') return <Chip tone="red">Cancelled</Chip>;
  if (st === 'draft') return <Chip>Draft</Chip>;
  if (st === 'received') return <Chip tone="green">Received</Chip>;
  return <><Chip tone="green">Posted</Chip><Chip tone="amber">{receipt ? 'In transit' : 'Sent'}</Chip></>;
}

function SendTab() {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const list = useBranchOuts();
  const receipts = useSentTransferReceipts();
  const counts = Object.fromEntries(STATUS_FILTERS.send.map((f) => [f.key, f.key === 'all'
    ? list.rows.length
    : list.rows.filter((r) => sendStatus(r, receipts.get(r.transaction_id)) === f.key).length]));
  const rows = list.rows
    .filter((r) => filter === 'all' || sendStatus(r, receipts.get(r.transaction_id)) === filter)
    .filter((r) => matchesSearch(r, search));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" variant={view === 'new' ? 'outline' : 'default'} onClick={() => setView((v) => (v === 'new' ? 'list' : 'new'))}>
          {view === 'new' ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Plus className="h-3.5 w-3.5" /> New transfer</>}
        </Button>
      </div>
      {view === 'new' ? (
        <div className="rounded-xl border border-border bg-card p-4"><NewBranchOutForm onDone={() => setView('list')} /></div>
      ) : (
        <>
          <ListToolbar filters={STATUS_FILTERS.send} value={filter} onChange={setFilter} search={search} onSearch={setSearch} counts={counts} />
          <ListShell {...list} rows={rows} emptyIcon={Truck}
            emptyTitle={list.rows.length ? 'Nothing matches this filter.' : 'No transfers sent yet.'}
            emptyHint="Transfers this store sends to other branches appear here.">
            {rows.map((r) => {
              const receipt = receipts.get(r.transaction_id);
              return (
                <DocRow key={r.transaction_id} title={r.document_no} subtitle={`To ${r.party_display_name ?? r.party_name}${receipt ? ` · ${receipt.document_no}` : ''}`}
                  meta={`${r.posting_date && r.document_status === 1 ? `Posted ${formatDateTime(r.posting_date)}` : formatDate(r.document_date)} · ${r.pieces ?? 0} pc · ${Number(r.weight ?? 0).toFixed(3)} g${r.username ? ` · ${r.username}` : ''}`}
                  amount={r.net_amount}
                  chips={<SendStatusChips row={r} receipt={receipt} />}
                  onSelect={() => setSelectedId(r.transaction_id)} />
              );
            })}
          </ListShell>
        </>
      )}
      {selectedId && <BranchOutDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

// ── Receive (Branch In) ─────────────────────────────────────────────────

function AuthorizeDialog({ open, onOpenChange, onConfirm, isPending }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const close = (o) => { if (!o) { setUsername(''); setPassword(''); } onOpenChange(o); };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Authorise receipt</DialogTitle>
          <DialogDescription>Enter the OrnaVerse username and password of the person authorising this receipt.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (username && password) onConfirm({ username, password }, () => close(false)); }}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bt-user">Username</Label>
            <Input id="bt-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" className="h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bt-pass">Password</Label>
            <Input id="bt-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="h-11" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" disabled={!username || !password || isPending}>{isPending ? 'Authorising…' : 'Authorise'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BranchInDetail({ id, onClose }) {
  const { entity, isLoading, isError, refetch } = useBranchInDetail(id);
  const authorize = useAuthorizeBranchIn();
  const [authOpen, setAuthOpen] = useState(false);
  const pending = entity && !entity.authorize && entity.document_status !== 2;
  const sentId = entity?.ref_document_id === DOCS.BRANCH_OUT ? entity.ref_transaction_id : null;
  const sent = useQuery({
    queryKey: ['branch-transfer', 'out', 'detail', sentId],
    queryFn: () => retrieveBranchOut(sentId),
    enabled: !!sentId,
    staleTime: 0,
    retry: false,
  });
  const inEvents = useTransferEvents('branch_in', [id]);
  const outEvents = useTransferEvents('branch_out', [sentId]);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{entity?.document_no ?? 'Receipt'}</SheetTitle>
          <SheetDescription>{entity ? `From ${entity.party_display_name ?? entity.party_name} · ${formatDate(entity.document_date)}` : ' '}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {isLoading ? <InlineLoader label="Loading…" /> : isError || !entity ? <ErrorState title="Couldn't load this receipt." onRetry={refetch} /> : (
            <>
              <div className="flex flex-wrap gap-2">
                <DocStatusChip status={entity.document_status} />
                {entity.authorize ? <Chip tone="green">Authorised{entity.authorized_by_name ? ` by ${entity.authorized_by_name}` : ''}</Chip> : <Chip tone="amber">Awaiting authorisation</Chip>}
              </div>
              {entity.remark && <p className="text-sm text-muted-foreground">{entity.remark}</p>}
              <LinesTable lines={entity.line_items ?? []} />
              <TotalsBar totals={transferTotals(entity.line_items ?? [], entity.is_tax_applicable)} />
              <Timeline
                events={[...outEvents.filter((e) => e.action === 'cancelled'), ...inEvents.filter((e) => e.action !== 'authorised')]}
                steps={[
                  sent.data && { label: `Sent as ${sent.data.document_no}`, at: sent.data.posting_date ?? sent.data.creation_date, by: sent.data.posted_by_name ?? sent.data.username, tone: 'green' },
                  { label: 'Receipt created (in transit)', at: entity.creation_date },
                  entity.authorize
                    ? { label: 'Received & authorised', at: authorisedAt(entity), by: entity.authorized_by_name, tone: 'green' }
                    : entity.document_status === 2
                      ? { label: 'Cancelled', tone: 'red' }
                      : { label: 'Awaiting authorisation at this store', pending: true, tone: 'amber' },
                ]}
              />
              {pending && (
                <Button onClick={() => setAuthOpen(true)}><ShieldCheck className="h-4 w-4" /> Authorise receipt</Button>
              )}
            </>
          )}
        </div>
        <AuthorizeDialog open={authOpen} onOpenChange={setAuthOpen} isPending={authorize.isPending}
          onConfirm={(creds, done) => authorize.mutate({ id, documentNo: entity?.document_no ?? null, ...creds }, { onSuccess: () => { done(); refetch(); } })} />
      </SheetContent>
    </Sheet>
  );
}

const receiveStatus = (r) => (r.authorize ? 'received' : r.document_status === 2 ? 'cancelled' : 'awaiting');

function ReceiveTab({ initialId = null }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(initialId);
  const list = useBranchIns();
  const counts = Object.fromEntries(STATUS_FILTERS.receive.map((f) => [f.key, f.key === 'all'
    ? list.rows.length
    : list.rows.filter((r) => receiveStatus(r) === f.key).length]));
  const rows = list.rows
    .filter((r) => filter === 'all' || receiveStatus(r) === filter)
    .filter((r) => matchesSearch(r, search));
  return (
    <div className="flex flex-col gap-3">
      <ListToolbar filters={STATUS_FILTERS.receive} value={filter} onChange={setFilter} search={search} onSearch={setSearch} counts={counts} />
      <ListShell {...list} rows={rows} emptyIcon={PackageCheck} emptyTitle={list.rows.length ? 'Nothing matches this filter.' : 'No receipts yet.'}
        emptyHint="Transfers other branches send to this store appear here once they are posted.">
        {rows.map((r) => (
          <DocRow key={r.transaction_id} title={r.document_no} subtitle={`From ${r.party_display_name ?? r.party_name}`}
            meta={`${r.authorize ? `Received ${formatDateTime(authorisedAt(r))}${r.authorized_by_name ? ` by ${r.authorized_by_name}` : ''}` : `Sent ${formatDateTime(r.posting_date ?? r.creation_date)}`} · ${r.pieces ?? 0} pc · ${Number(r.weight ?? 0).toFixed(3)} g`}
            amount={r.net_amount}
            chips={r.authorize ? <Chip tone="green">Received</Chip> : r.document_status === 2 ? <Chip tone="red">Cancelled</Chip> : <Chip tone="amber">Awaiting authorisation</Chip>}
            onSelect={() => setSelectedId(r.transaction_id)} />
        ))}
      </ListShell>
      {selectedId && <BranchInDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

// ── Stock Allocation ────────────────────────────────────────────────────

const allocationStatus = (l) => {
  const done = l.allocated_pieces ?? 0;
  if (done <= 0) return { label: 'Pending', tone: 'muted' };
  return done >= (l.pieces ?? 0) ? { label: 'Complete', tone: 'green' } : { label: 'Partial', tone: 'amber' };
};
const orderLineKey = (r) => `${r.document_no ?? ''}#${r.transaction_item_id ?? r.item_line_no ?? ''}`;

function OrderLinePicker({ source, companyId, excludeKeys, onAdd, onClose }) {
  const [picked, setPicked] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const orders = useQuery({
    queryKey: ['branch-transfer', 'order-lines', source, companyId],
    queryFn: () => (source === 'sales' ? listSalesOrderLines() : listPosOrderLines(companyId)),
    staleTime: 0,
    gcTime: 0,
  });
  const rows = (orders.data ?? []).filter((r) => !excludeKeys.has(orderLineKey(r)));
  const toggle = (r) => setPicked((p) => (p.some((x) => orderLineKey(x) === orderLineKey(r)) ? p.filter((x) => orderLineKey(x) !== orderLineKey(r)) : [...p, r]));
  const add = async () => {
    setIsAdding(true);
    try {
      await onAdd(picked);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-medium">{source === 'sales' ? 'Sales Orders' : 'POS Orders'}</p>
      {orders.isLoading ? <InlineLoader className="py-4" label="Loading orders…" /> : orders.isError ? (
        <ErrorState className="py-4" title="Couldn't load orders." onRetry={orders.refetch} />
      ) : rows.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No open order lines.</p> : (
        <div className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {rows.map((r) => {
            const on = picked.some((x) => orderLineKey(x) === orderLineKey(r));
            return (
              <button key={orderLineKey(r)} type="button" onClick={() => toggle(r)} aria-pressed={on}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-left ${on ? 'bg-primary/5' : 'hover:bg-muted/40'}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{r.item_code}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.document_no} · {r.party_name ?? '—'} · {formatDate(r.document_date)}</span>
                </span>
                {on && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        <Button type="button" className="flex-1" disabled={!picked.length || isAdding} onClick={add}>{isAdding ? 'Adding…' : `Add ${picked.length} line${picked.length === 1 ? '' : 's'}`}</Button>
      </div>
    </div>
  );
}

function AllotStockPicker({ line, excludeKeys, onPick, onClose }) {
  const [isAdding, setIsAdding] = useState(false);
  const stock = useQuery({
    queryKey: ['branch-transfer', 'allot-stock', line.item_id, line.item_attribute_id],
    queryFn: () => listAllocatableStock(line),
    staleTime: 0,
    gcTime: 0,
  });
  const rows = (stock.data ?? []).filter((r) => !excludeKeys.has(stockKey(r)));
  const pick = async (r) => {
    setIsAdding(true);
    try {
      await onPick(r);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-medium">Select stock for {line.item_code}</p>
      {stock.isLoading || isAdding ? <InlineLoader className="py-4" label={isAdding ? 'Adding…' : 'Loading stock…'} /> : stock.isError ? (
        <ErrorState className="py-4" title="Couldn't load stock." onRetry={stock.refetch} />
      ) : rows.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No unallocated stock of this item.</p> : (
        <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {rows.map((r) => (
            <button key={stockKey(r)} type="button" onClick={() => pick(r)} className="flex flex-col px-3 py-2 text-left hover:bg-muted/40">
              <span className="text-sm">{r.sku || r.item_code}</span>
              <span className="text-xs text-muted-foreground">{r.location_name} · {r.pieces} pc · {Number(r.weight ?? 0).toFixed(3)} g{r.certificate_no ? ` · ${r.certificate_no}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" onClick={onClose}>Close</Button>
    </div>
  );
}

function AllocationLines({ lines, selectedIdx, onSelect, onRemoveLine, onRemoveAllocated }) {
  return (
    <div className="flex flex-col gap-2">
      {lines.map((l, i) => {
        const st = allocationStatus(l);
        const active = i === selectedIdx;
        return (
          <div key={`${orderLineKey(l)}-${i}`} className={`rounded-xl border ${active ? 'border-primary bg-primary/5' : 'border-border'} p-3`}>
            <div className="flex items-start justify-between gap-3">
              <button type="button" className="min-w-0 text-left" onClick={() => onSelect?.(i)}>
                <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{l.item_code}</span><Chip tone={st.tone}>{st.label}</Chip></span>
                <span className="block text-xs text-muted-foreground">
                  Required {l.pieces ?? 0} pc · {Number(l.weight ?? 0).toFixed(3)} g · Allocated {l.allocated_pieces ?? 0} pc · {Number(l.allocated_weight ?? 0).toFixed(3)} g
                </span>
              </button>
              {onRemoveLine && (
                <button type="button" aria-label={`Remove ${l.item_code}`} onClick={() => onRemoveLine(i)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
            {(l.allocated_items ?? []).length > 0 && (
              <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                {l.allocated_items.map((a, j) => (
                  <div key={`${stockKey(a)}-${j}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{a.sku || a.item_code} · {a.pieces} pc · {Number(a.weight ?? 0).toFixed(3)} g</span>
                    {onRemoveAllocated && (
                      <button type="button" aria-label={`Remove ${a.sku || a.item_code}`} onClick={() => onRemoveAllocated(i, j)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NewAllocationForm({ onDone }) {
  const queryClient = useQueryClient();
  const { companyId, company } = useMyCompany();
  const headerConfig = useOrderHeaderConfig(DOCS.STOCK_ALLOCATION);
  const canPost = useCanPostAllocation();
  const [lines, setLines] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [source, setSource] = useState(null);
  const [allotOpen, setAllotOpen] = useState(false);
  const [narration, setNarration] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const addDemand = async (picked) => {
    const demand = await buildDemandLines({ rows: picked, source });
    if (!demand.length) throw new Error('No order lines could be added.');
    setLines((p) => [...p, ...demand]);
    if (selectedIdx == null) setSelectedIdx(lines.length);
  };

  const allot = async (row) => {
    const [priced] = await priceAllocatedStock([row]);
    if (!priced) throw new Error('Could not add this stock piece.');
    setLines((prev) => prev.map((l, i) => {
      if (i !== selectedIdx) return l;
      const allocated = [...(l.allocated_items ?? []), priced];
      return { ...l, allocated_items: allocated, ...allocationTotals(allocated) };
    }));
  };

  const removeAllocated = (i, j) => setLines((prev) => prev.map((l, k) => {
    if (k !== i) return l;
    const allocated = l.allocated_items.filter((_, x) => x !== j);
    return { ...l, allocated_items: allocated, ...allocationTotals(allocated) };
  }));

  const save = async () => {
    if (!lines.length) return toast.error('Cannot save without items.');
    const over = lines.find((l) => (l.allocated_pieces ?? 0) > (l.pieces ?? 0));
    if (over) return toast.error(`Allocated pieces cannot be greater than required pieces for ${over.item_code}.`);
    if (!headerConfig.isReady) return toast.error(headerConfig.isConfigMissing ? "Stock allocation isn't set up for this store in OrnaVerse." : 'Store configuration is still loading — try again in a moment.');
    setIsSaving(true);
    try {
      const res = await createStockAllocation({ companyId, companyCode: company?.company_code, partyId: company?.party_id, headerConfig, canPost, narration, lines });
      if (!res?.EntityId) throw new Error('Creation failed — no document was returned.');
      logTransferEvent({ doc_type: 'allocation', transaction_id: res.EntityId, action: 'created' });
      if (canPost) logTransferEvent({ doc_type: 'allocation', transaction_id: res.EntityId, action: 'posted' });
      toast.success(canPost ? 'Stock allocation saved and posted.' : 'Stock allocation saved as draft.');
      queryClient.invalidateQueries({ queryKey: ['branch-transfer'] });
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const selected = selectedIdx != null ? lines[selectedIdx] : null;
  const allocatedKeys = new Set(lines.flatMap((l) => (l.allocated_items ?? []).map(stockKey)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setSource('pos')}><Plus className="h-3.5 w-3.5" /> POS Order</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setSource('sales')}><Plus className="h-3.5 w-3.5" /> Sales Order</Button>
      </div>
      {source && (
        <OrderLinePicker key={source} source={source} companyId={companyId} excludeKeys={new Set(lines.map(orderLineKey))} onAdd={addDemand} onClose={() => setSource(null)} />
      )}

      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Add order lines, then select stock for each one.</p>
      ) : (
        <>
          <AllocationLines lines={lines} selectedIdx={selectedIdx} onSelect={(i) => { setSelectedIdx(i); setAllotOpen(false); }}
            onRemoveLine={(i) => { setLines((p) => p.filter((_, j) => j !== i)); setSelectedIdx(null); setAllotOpen(false); }}
            onRemoveAllocated={removeAllocated} />
          {selected && !allotOpen && (
            <Button type="button" variant="outline" onClick={() => setAllotOpen(true)}><Search className="h-4 w-4" /> Select stock for {selected.item_code}</Button>
          )}
          {selected && allotOpen && (
            <AllotStockPicker key={selectedIdx} line={selected} excludeKeys={allocatedKeys} onPick={allot} onClose={() => setAllotOpen(false)} />
          )}
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sa-narration">Narration</Label>
        <Textarea id="sa-narration" value={narration} onChange={(e) => setNarration(e.target.value)} rows={2} />
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={isSaving || headerConfig.isLoading} onClick={save}>{isSaving ? 'Saving…' : 'Save allocation'}</Button>
      </div>
    </div>
  );
}

/** OrnaVerse's Edit on an existing allocation: select (or remove) stock on its order lines, then save. */
function AllocationEditor({ entity, onSaved, onCancel }) {
  const [lines, setLines] = useState(() => structuredClone(entity.line_items ?? []));
  const [selectedIdx, setSelectedIdx] = useState(() => {
    const i = (entity.line_items ?? []).findIndex((l) => (l.allocated_pieces ?? 0) < (l.pieces ?? 0));
    return i >= 0 ? i : null;
  });
  const [allotOpen, setAllotOpen] = useState(false);
  const update = useUpdateAllocation();

  const allot = async (row) => {
    const [priced] = await priceAllocatedStock([row]);
    if (!priced) throw new Error('Could not add this stock piece.');
    setLines((prev) => prev.map((l, i) => {
      if (i !== selectedIdx) return l;
      const allocated = [...(l.allocated_items ?? []), priced];
      return { ...l, allocated_items: allocated, ...allocationTotals(allocated) };
    }));
  };
  const removeAllocated = (i, j) => setLines((prev) => prev.map((l, k) => {
    if (k !== i) return l;
    const allocated = l.allocated_items.filter((_, x) => x !== j);
    return { ...l, allocated_items: allocated, ...allocationTotals(allocated) };
  }));
  const save = () => {
    const over = lines.find((l) => (l.allocated_pieces ?? 0) > (l.pieces ?? 0));
    if (over) return toast.error(`Allocated pieces cannot be greater than required pieces for ${over.item_code}.`);
    update.mutate({ id: entity.transaction_id, documentNo: entity.document_no, lines }, { onSuccess: onSaved });
  };

  const selected = selectedIdx != null ? lines[selectedIdx] : null;
  const allocatedKeys = new Set(lines.flatMap((l) => (l.allocated_items ?? []).map(stockKey)));
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg bg-primary/5 p-2 text-xs text-foreground">Pick an order line, then select the stock piece to reserve for it. Removing a piece frees it.</p>
      <AllocationLines lines={lines} selectedIdx={selectedIdx} onSelect={(i) => { setSelectedIdx(i); setAllotOpen(false); }} onRemoveAllocated={removeAllocated} />
      {selected && !allotOpen && (selected.allocated_pieces ?? 0) < (selected.pieces ?? 0) && (
        <Button type="button" variant="outline" onClick={() => setAllotOpen(true)}><Search className="h-4 w-4" /> Select stock for {selected.item_code}</Button>
      )}
      {selected && allotOpen && (
        <AllotStockPicker key={selectedIdx} line={selected} excludeKeys={allocatedKeys} onPick={allot} onClose={() => setAllotOpen(false)} />
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Discard changes</Button>
        <Button type="button" className="flex-1" disabled={update.isPending} onClick={save}>{update.isPending ? 'Saving…' : 'Save allocation'}</Button>
      </div>
    </div>
  );
}

function AllocationDetail({ id, onClose }) {
  const { entity, isLoading, isError, refetch } = useStockAllocationDetail(id);
  const { canEdit, canPost } = useAllocationPermissions();
  const postDoc = usePostAllocation();
  const cancelDoc = useCancelAllocation();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const events = useTransferEvents('allocation', [id]);
  const status = entity?.document_status;
  const docNo = entity?.document_no ?? null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{entity?.document_no ?? 'Stock allocation'}</SheetTitle>
          <SheetDescription>{entity ? formatDate(entity.document_date) : ' '}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {isLoading ? <InlineLoader label="Loading…" /> : isError || !entity ? <ErrorState title="Couldn't load this allocation." onRetry={refetch} /> : editing ? (
            <AllocationEditor entity={entity} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); }} />
          ) : (
            <>
              <DocStatusChip status={status} />
              {entity.narration && <p className="text-sm text-muted-foreground">{entity.narration}</p>}
              <AllocationLines lines={entity.line_items ?? []} />
              <Timeline
                events={events.filter((e) => e.action !== 'posted' && (e.action !== 'created' || entity.creation_date))}
                steps={[
                  entity.creation_date
                    ? { label: 'Created', at: entity.creation_date, by: entity.username }
                    : !events.some((e) => e.action === 'created') && { label: 'Created', at: entity.document_date, dateOnly: true, by: entity.username },
                  status !== 0 && entity.posting_date && { label: 'Posted', at: entity.posting_date, by: entity.posted_by_name, tone: 'green' },
                  status === 0 && { label: 'Draft · not posted yet', pending: true, tone: 'amber' },
                ]}
              />
              <div className="flex flex-col gap-2">
                {status !== 2 && canEdit && (
                  <Button variant="outline" onClick={() => setEditing(true)}><Search className="h-4 w-4" /> Edit · select stock</Button>
                )}
                {status === 0 && canPost && (
                  <Button disabled={postDoc.isPending} onClick={() => postDoc.mutate({ id, documentNo: docNo }, { onSuccess: () => refetch() })}>
                    {postDoc.isPending ? 'Posting…' : 'Post allocation'}
                  </Button>
                )}
                {(status === 0 || status === 1) && canPost && (
                  <Button variant="outline" className="text-destructive hover:text-destructive" disabled={cancelDoc.isPending} onClick={() => setConfirm(true)}>Cancel allocation</Button>
                )}
              </div>
            </>
          )}
        </div>
        <ConfirmDialog isOpen={confirm} onOpenChange={setConfirm}
          title="Cancel this allocation?"
          description={status === 0 ? 'Cancel this draft allocation?' : 'This reverses the allocation in OrnaVerse — every reserved piece on it becomes free stock again. This cannot be undone.'}
          confirmLabel="Cancel allocation"
          onConfirm={() => cancelDoc.mutate({ id, documentNo: docNo }, { onSuccess: () => { setConfirm(false); onClose(); } })} />
      </SheetContent>
    </Sheet>
  );
}

const allocationDocStatus = (r) => (r.document_status === 2 ? 'cancelled' : r.document_status === 1 ? 'posted' : 'draft');

function AllocationTab() {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const list = useStockAllocations();
  const cancelled = useCancelledAllocations().filter((e) => matchesSearch(e, search));
  const counts = Object.fromEntries(STATUS_FILTERS.allocation.map((f) => [f.key, f.key === 'all'
    ? list.rows.length
    : f.key === 'cancelled'
      ? cancelled.length
      : list.rows.filter((r) => allocationDocStatus(r) === f.key).length]));
  const rows = list.rows
    .filter((r) => filter === 'all' || allocationDocStatus(r) === filter)
    .filter((r) => matchesSearch(r, search));
  const showCancelled = filter === 'cancelled';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" variant={view === 'new' ? 'outline' : 'default'} onClick={() => setView((v) => (v === 'new' ? 'list' : 'new'))}>
          {view === 'new' ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Plus className="h-3.5 w-3.5" /> New allocation</>}
        </Button>
      </div>
      {view === 'new' ? (
        <div className="rounded-xl border border-border bg-card p-4"><NewAllocationForm onDone={() => setView('list')} /></div>
      ) : (
        <>
          <ListToolbar filters={STATUS_FILTERS.allocation} value={filter} onChange={setFilter} search={search} onSearch={setSearch} counts={counts} />
          {showCancelled ? (
            cancelled.length === 0 ? (
              <EmptyState icon={Boxes} title="No cancelled allocations." description="Allocations cancelled from the POS at this store are listed here (OrnaVerse removes them on cancel)." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                {cancelled.map((e) => (
                  <div key={`${e.transaction_id}-${e.at}`} className="flex flex-col gap-0.5 border-b border-border px-4 py-3.5 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{e.document_no ?? `Allocation #${e.transaction_id}`}</p>
                      <Chip tone="red">Cancelled</Chip>
                    </div>
                    <p className="text-xs text-muted-foreground">Cancelled {formatDateTime(new Date(e.at))} · {e.user}{e.store_code ? ` (${e.store_code})` : ''} · stock released</p>
                  </div>
                ))}
              </div>
            )
          ) : (
          <ListShell {...list} rows={rows} emptyIcon={Boxes} emptyTitle={list.rows.length ? 'Nothing matches this filter.' : 'No stock allocations yet.'} emptyHint="Stock reserved against orders at this store appears here.">
            {rows.map((r) => (
              <DocRow key={r.transaction_id} title={r.document_no} subtitle={r.narration || null}
                meta={`${r.posting_date && r.document_status === 1 ? `Posted ${formatDateTime(r.posting_date)}` : formatDate(r.document_date)}${r.username ? ` · ${r.username}` : ''}`}
                chips={<DocStatusChip status={r.document_status} />}
                onSelect={() => setSelectedId(r.transaction_id)} />
            ))}
          </ListShell>
          )}
        </>
      )}
      {selectedId && <AllocationDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function BranchTransferScreen() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const receiveId = Number(searchParams.get('in')) || null;
  const initialTab = TABS.some((t) => t.key === requestedTab) ? requestedTab : 'send';
  return <BranchTransferBody key={`${initialTab}-${receiveId ?? ''}`} initialTab={initialTab} receiveId={receiveId} />;
}

function BranchTransferBody({ initialTab, receiveId }) {
  const [tab, setTab] = useState(initialTab);
  const { companyId } = useMyCompany();
  if (!companyId) {
    return <div className="p-4"><EmptyState icon={Truck} title="No store selected." description="Switch to a store to manage branch transfers." /></div>;
  }
  return (
    <div className="flex flex-col gap-4 p-4 pb-8 md:px-6">
      <p className="text-sm text-muted-foreground">Send stock to other branches, receive incoming transfers and reserve stock against orders.</p>
      <PillTabs tabs={TABS} value={tab} onChange={setTab} getKey={(t) => t.key} getLabel={(t) => t.label} getIcon={(t) => t.icon} variant="pill" scrollable />
      {tab === 'send' && <SendTab />}
      {tab === 'receive' && <ReceiveTab initialId={receiveId} />}
      {tab === 'allocation' && <AllocationTab />}
    </div>
  );
}

export default function BranchTransferPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <BranchTransferScreen />
    </Suspense>
  );
}
