'use client';

import { Suspense, useState } from 'react';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowLeftRight, Plus, X, Check, ChevronRight, RefreshCw,
  Calendar, User, Hash, IndianRupee, Building2,
} from 'lucide-react';

import { useInterstoreReturns } from '@/hooks/interstoreReturn/useInterstoreReturns';
import { useInterstoreReturnDetail } from '@/hooks/interstoreReturn/useInterstoreReturnDetail';
import { useSoldItemsAcrossBranches } from '@/hooks/interstoreReturn/useSoldItemsAcrossBranches';
import {
  useCreateInterstoreReturn,
  useInterstoreReturnLifecycleActions,
} from '@/hooks/interstoreReturn/useInterstoreReturnMutations';
import {
  calculateInterstoreReturnItems,
  mapReturnLineToInterstoreReturnLine,
  updateInterstoreReturnEntity,
  interstoreReturnStoreRole,
} from '@/services/interstoreReturnService';
import { useActiveStore } from '@/hooks/store/useActiveStore';
import { fileToDataUrl } from '@/lib/files/fileToDataUrl';
import { selectCartCustomerId, selectCartCustomerName } from '@/store/slices/cartSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString, formatDatePadded } from '@/lib/dateUtils';
import { formatAmountOrDash } from '@/lib/priceUtils';

import ConfirmDialog from '@/components/shared/ConfirmDialog';
import CustomerAttachedBanner from '@/components/shared/CustomerAttachedBanner';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import LinePhotoPicker from '@/components/shared/LinePhotoPicker';
import PageLoader from '@/components/shared/PageLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const formatINR = formatAmountOrDash;
const formatDate = formatDatePadded;
const { INTERSTORE_RETURN_STATUS } = APP_CONFIG;

function getErrorMessage(error) {
  return (
    error?.response?.data?.Message ??
    error?.response?.data?.message ??
    error?.message ??
    'Something went wrong.'
  );
}

const STATUS_LABEL = {
  [INTERSTORE_RETURN_STATUS.DRAFT]: 'Draft',
  [INTERSTORE_RETURN_STATUS.PENDING_APPROVAL]: 'Pending Approval',
  [INTERSTORE_RETURN_STATUS.APPROVED]: 'Approved',
  [INTERSTORE_RETURN_STATUS.PENDING_SETTLEMENT]: 'Pending Settlement',
  [INTERSTORE_RETURN_STATUS.CLOSED]: 'Closed',
  [INTERSTORE_RETURN_STATUS.REJECTED]: 'Rejected',
  [INTERSTORE_RETURN_STATUS.PERMANENTLY_CLOSED]: 'Permanently Closed',
  [INTERSTORE_RETURN_STATUS.DEEMED_SUPPLY]: 'Deemed Supply',
};

const STATUS_CHIP_CLASS = {
  [INTERSTORE_RETURN_STATUS.DRAFT]: 'bg-muted text-muted-foreground',
  [INTERSTORE_RETURN_STATUS.PENDING_APPROVAL]: 'bg-status-made-order/15 text-status-made-order',
  [INTERSTORE_RETURN_STATUS.APPROVED]: 'bg-status-in-stock/15 text-status-in-stock',
  [INTERSTORE_RETURN_STATUS.PENDING_SETTLEMENT]: 'bg-status-made-order/15 text-status-made-order',
  [INTERSTORE_RETURN_STATUS.CLOSED]: 'bg-status-in-stock/15 text-status-in-stock',
  [INTERSTORE_RETURN_STATUS.REJECTED]: 'bg-destructive/15 text-destructive',
  [INTERSTORE_RETURN_STATUS.PERMANENTLY_CLOSED]: 'bg-muted text-muted-foreground',
  [INTERSTORE_RETURN_STATUS.DEEMED_SUPPLY]: 'bg-violet-500/15 text-violet-600',
};

function StatusChip({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP_CLASS[status] ?? 'bg-muted text-muted-foreground'}`}>
      {STATUS_LABEL[status] ?? `Status ${status}`}
    </span>
  );
}

// A sold-item row has no single stable id — identify it the same way the
// document itself does, same convention as the same-store Returns picker.
const soldItemKey = (row) => `${row.document_no ?? ''}#${row.item_line_no ?? ''}`;

// ── Create flow ──────────────────────────────────────────────────────────

const createSchema = z.object({
  document_date: z.string().min(1, 'Required'),
  remark: z.string().optional(),
  selected_keys: z.array(z.string()).min(1, 'Select at least one item'),
});

function InterstoreReturnCreateForm({ onDone }) {
  const receivingStoreId = useSelector(selectActiveStoreId);
  const customerId = useSelector(selectCartCustomerId);
  const customerName = useSelector(selectCartCustomerName);
  const { soldItems, isLoading: soldLoading, isError: soldError, refetch: refetchSold } =
    useSoldItemsAcrossBranches(customerId);

  const [photosByKey, setPhotosByKey] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { document_date: todayDateString(), remark: '', selected_keys: [] },
  });

  const selectedKeys = watch('selected_keys');
  const selectedRows = soldItems.filter((r) => selectedKeys.includes(soldItemKey(r)));
  const lockedOriginCompanyId = selectedRows[0]?.company_id ?? null;

  const createDoc = useCreateInterstoreReturn();
  const { submitForApproval } = useInterstoreReturnLifecycleActions();

  const toggleItem = (row) => {
    const key = soldItemKey(row);
    setValue(
      'selected_keys',
      selectedKeys.includes(key) ? selectedKeys.filter((k) => k !== key) : [...selectedKeys, key],
      { shouldValidate: true },
    );
  };

  const onSubmit = async (data) => {
    if (!customerId) return toast.error('Assign a customer to the session first.');
    if (!lockedOriginCompanyId) return toast.error('Select at least one item.');
    if (lockedOriginCompanyId === receivingStoreId) {
      return toast.error('The item must have been sold at a DIFFERENT store — pick items from another branch, or use a same-store Return instead.');
    }
    const missingPhoto = selectedRows.find((row) => !photosByKey[soldItemKey(row)]);
    if (missingPhoto) return toast.error('Attach a photo for every selected item before submitting.');

    setIsSubmitting(true);
    try {
      const pricedLines = await calculateInterstoreReturnItems({
        items: selectedRows,
        documentDate: new Date(data.document_date),
      });
      if (!pricedLines.length) throw new Error('Could not price the selected items.');
      const lineItems = pricedLines.map((line, i) => mapReturnLineToInterstoreReturnLine(line, i + 1));

      const created = await createDoc.mutateAsync({
        partyId: customerId,
        partyName: customerName,
        originCompanyId: lockedOriginCompanyId,
        receivingCompanyId: receivingStoreId,
        documentDate: new Date(data.document_date).toISOString(),
        remark: data.remark,
        lineItems,
        headerConfig: {
          financialYearId: null,
          isDocumentNumberEditable: false,
          numberOfBackdatedDays: 365,
        },
      });
      const entity = created?.Entity;
      if (!entity?.interstore_return_id) throw new Error('Creation failed — no record returned.');
      const dataUrls = await Promise.all(selectedRows.map((row) => fileToDataUrl(photosByKey[soldItemKey(row)])));
      const entityWithImages = {
        ...entity,
        line_items: (entity.line_items ?? []).map((li, i) => ({
          ...li,
          images: [{ image_path: dataUrls[i] }],
        })),
      };
      await updateInterstoreReturnEntity(entityWithImages);

      await submitForApproval.mutateAsync({ entity, requiredCompanyId: receivingStoreId });
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const total = selectedRows.reduce((s, r) => s + (r.net_amount ?? 0), 0);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />

      <div className="flex flex-col gap-1.5">
        <Label>Date</Label>
        <Input type="date" max={todayDateString()} {...register('document_date')} className="h-11" />
        {errors.document_date && <p className="text-xs text-destructive">{errors.document_date.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Items Bought At Another Store <span className="text-destructive">*</span></Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Shows this customer&apos;s purchases from every branch. Pick items from ONE other store —
          a photo is required for each before it can be submitted for approval.
        </p>

        {!customerId ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Assign a customer to see their purchases.
          </p>
        ) : soldLoading ? (
          <InlineLoader className="py-6" label="Loading purchases…" />
        ) : soldError ? (
          <ErrorState className="py-6" title="Couldn't load purchases." onRetry={() => refetchSold()} />
        ) : soldItems.length === 0 ? (
          <EmptyState className="border-0 py-6" icon={ArrowLeftRight} title="No purchases found for this customer." description="Only previously sold items can be returned." />
        ) : (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
            {soldItems.map((row) => {
              const key = soldItemKey(row);
              const isSelected = selectedKeys.includes(key);
              const isSameStore = row.company_id === receivingStoreId;
              const isLockedOut = !isSelected && lockedOriginCompanyId != null && row.company_id !== lockedOriginCompanyId;
              const disabled = isSameStore || isLockedOut;
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleItem(row)}
                    aria-pressed={isSelected}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors min-h-[44px] ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : disabled
                          ? 'cursor-not-allowed border-border bg-muted/40 opacity-50'
                          : 'border-border bg-muted hover:bg-muted/70'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="truncate text-sm font-medium text-foreground">
                        {row.item_name ?? row.item_code ?? `Item ${row.item_line_no}`}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.sku} · {row.document_no}
                        {isSameStore && ' · sold at this store — use a same-store Return instead'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold tabular-nums text-foreground">{formatINR(row.net_amount)}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                    </div>
                  </button>
                  {isSelected && (
                    <LinePhotoPicker
                      file={photosByKey[key] ?? null}
                      onChange={(file) => setPhotosByKey((prev) => ({ ...prev, [key]: file }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {errors.selected_keys && <p className="text-xs text-destructive">{errors.selected_keys.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Remark</Label>
        <Textarea {...register('remark')} rows={2} placeholder="Reason for return, size issue, etc." />
      </div>

      {total > 0 && (
        <div className="flex justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium">
          <span className="text-muted-foreground">Total Return Amount</span>
          <span className="text-foreground">{formatINR(total)}</span>
        </div>
      )}

      <Button type="submit" disabled={isSubmitting || !customerId || selectedRows.length === 0} className="h-12 mt-1">
        {isSubmitting ? 'Submitting Interstore Return…' : 'Create & Submit for Approval'}
      </Button>
    </form>
  );
}

// ── Detail sheet ─────────────────────────────────────────────────────────

function RejectDialog({ isOpen, onOpenChange, onConfirm }) {
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');

  const handleConfirm = () => {
    onConfirm({ rejectionReasonId: Number(reasonId), rejectionNote: note });
    onOpenChange(false);
    setReasonId('');
    setNote('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Interstore Return</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Rejection Reason ID</Label>
            <Input type="number" value={reasonId} onChange={(e) => setReasonId(e.target.value)} className="h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11">Cancel</Button>
          <Button type="button" variant="destructive" disabled={!reasonId} onClick={handleConfirm} className="h-11">Reject</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InterstoreReturnDetailSheet({ interstoreReturnId, onClose }) {
  const myStoreId = useSelector(selectActiveStoreId);
  const { entity, isLoading, isError, refetch } = useInterstoreReturnDetail(interstoreReturnId);
  const { submitForApproval, approve, reject, resubmit, returnToOrigin, localAbsorption } =
    useInterstoreReturnLifecycleActions({ onSuccess: () => refetch() });
  const [confirmAction, setConfirmAction] = useState(null); // { label, mutation, requiredCompanyId }
  const [rejectOpen, setRejectOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center">
        <InlineLoader label="Loading…" />
      </div>
    );
  }
  if (isError || !entity) {
    return (
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose}>
        <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-50 p-4" onClick={(e) => e.stopPropagation()}>
          <ErrorState title="Couldn't load this record." onRetry={refetch} />
        </div>
      </div>
    );
  }

  const { isOriginStore, isReceivingStore } = interstoreReturnStoreRole(entity, myStoreId);
  const status = entity.status;

  const actions = [];
  if ((status === INTERSTORE_RETURN_STATUS.DRAFT || status === INTERSTORE_RETURN_STATUS.REJECTED) && isReceivingStore) {
    actions.push({ label: 'Submit for Approval', mutation: submitForApproval, requiredCompanyId: entity.receiving_company_id, variant: 'default' });
  }
  if (status === INTERSTORE_RETURN_STATUS.REJECTED && isReceivingStore) {
    actions.push({ label: 'Resubmit', mutation: resubmit, requiredCompanyId: entity.receiving_company_id, variant: 'default' });
  }
  if (status === INTERSTORE_RETURN_STATUS.PENDING_APPROVAL && isOriginStore) {
    actions.push({ label: 'Approve', mutation: approve, requiredCompanyId: entity.origin_company_id, variant: 'default' });
    actions.push({ label: 'Reject', mutation: reject, requiredCompanyId: entity.origin_company_id, variant: 'destructive', isReject: true });
  }
  if (status === INTERSTORE_RETURN_STATUS.PENDING_SETTLEMENT && isReceivingStore) {
    actions.push({ label: 'Return to Origin', mutation: returnToOrigin, requiredCompanyId: entity.receiving_company_id, variant: 'outline' });
    actions.push({ label: 'Local Absorption', mutation: localAbsorption, requiredCompanyId: entity.receiving_company_id, variant: 'default' });
  }

  const headerRows = [
    { icon: Hash, label: 'Document No', value: entity.document_no ?? `#${entity.interstore_return_id}` },
    { icon: Calendar, label: 'Date', value: formatDate(entity.document_date) },
    { icon: User, label: 'Customer', value: entity.party_name ?? '—' },
    { icon: Building2, label: 'Origin → Receiving', value: `${entity.origin_company_name ?? entity.origin_company_id} → ${entity.receiving_company_name ?? entity.receiving_company_id}` },
    { icon: IndianRupee, label: 'Amount', value: formatINR(entity.net_amount) },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-50 flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Interstore Return</p>
            <p className="text-sm font-semibold text-foreground">{entity.document_no ?? `#${entity.interstore_return_id}`}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <StatusChip status={status} />
          {!isOriginStore && !isReceivingStore && (
            <p className="text-xs text-muted-foreground">
              Your current store is neither side of this transfer — no actions available here.
            </p>
          )}
          <div className="bg-muted/30 rounded-xl p-4 flex flex-col gap-3">
            {headerRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium text-foreground break-words">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {entity.remark && (
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground mb-1">Remark</p>
              <p className="text-sm text-foreground">{entity.remark}</p>
            </div>
          )}
          {status === INTERSTORE_RETURN_STATUS.REJECTED && entity.rejection_note && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs text-destructive mb-1">Rejection reason {entity.rejection_reason_id}</p>
              <p className="text-sm text-foreground">{entity.rejection_note}</p>
            </div>
          )}

          {(entity.line_items ?? []).length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Items</p>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {entity.line_items.map((li) => (
                  <div key={li.interstore_return_item_id ?? li.line_no} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{li.item_name ?? li.sku}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(li.images?.length ?? 0) > 0 ? `${li.images.length} photo(s)` : 'No photo attached'}
                      </p>
                    </div>
                    <p className="text-xs font-semibold tabular-nums text-foreground">{formatINR(li.valuation_amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div className="border-t border-border p-4 flex flex-col gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant={action.variant}
                className="w-full h-11 gap-1.5"
                disabled={action.mutation.isPending}
                onClick={() => (action.isReject ? setRejectOpen(true) : setConfirmAction(action))}
              >
                {action.mutation.isPending ? 'Working…' : action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {confirmAction && (
        <ConfirmDialog
          isOpen={!!confirmAction}
          onOpenChange={(open) => !open && setConfirmAction(null)}
          title={confirmAction.label}
          description={`${confirmAction.label} this interstore return (${entity.document_no})? This may not be reversible.`}
          confirmLabel={confirmAction.label}
          confirmVariant={confirmAction.variant === 'destructive' ? 'destructive' : 'default'}
          onConfirm={() => confirmAction.mutation.mutate({ entity, requiredCompanyId: confirmAction.requiredCompanyId })}
        />
      )}

      <RejectDialog
        isOpen={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={({ rejectionReasonId, rejectionNote }) =>
          reject.mutate({ entity, requiredCompanyId: entity.origin_company_id, rejectionReasonId, rejectionNote })
        }
      />
    </>
  );
}

// ── List / inbox ─────────────────────────────────────────────────────────

function InterstoreReturnRow({ item, onSelect }) {
  return (
    <button onClick={() => onSelect(item)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted/30 active:bg-muted/50 transition-colors text-left">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{item.document_no ?? `#${item.interstore_return_id}`}</p>
          <StatusChip status={item.status} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{item.party_name ?? 'Unknown customer'}</p>
        <p className="text-xs text-muted-foreground">
          {item.origin_company_code ?? item.origin_company_id} → {item.receiving_company_code ?? item.receiving_company_id} · {formatDate(item.document_date)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p className="text-sm font-semibold text-foreground tabular-nums">{formatINR(item.net_amount)}</p>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );
}

const MODE_TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'outbox', label: 'Submitted' },
  { id: 'all', label: 'All' },
];

function InterstoreReturnList() {
  const [mode, setMode] = useState('inbox');
  const [pendingOnly, setPendingOnly] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const { rows, isLoading, isFetching, isError, refetch } = useInterstoreReturns({ mode, pendingOnly });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {MODE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMode(tab.id);
                if (tab.id === 'all') setPendingOnly(false);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === tab.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPendingOnly((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            pendingOnly ? 'bg-status-made-order/15 text-status-made-order' : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
        >
          {pendingOnly ? 'Pending only' : 'All statuses'}
        </button>
      </div>

      {isLoading ? (
        <ListRowsSkeleton rows={5} lines={3} />
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <p className="text-sm text-muted-foreground">Failed to load interstore returns.</p>
          <button onClick={refetch} className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="Nothing here." description="No interstore returns match this filter." />
      ) : (
        <>
          {isFetching && <div className="flex justify-center py-2"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" /></div>}
          <div className="rounded-xl border border-border overflow-hidden">
            {rows.map((row) => (
              <InterstoreReturnRow key={row.interstore_return_id} item={row} onSelect={(r) => setSelectedId(r.interstore_return_id)} />
            ))}
          </div>
        </>
      )}

      {selectedId && (
        <InterstoreReturnDetailSheet interstoreReturnId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}

function TransfersScreen() {
  const [view, setView] = useState('list'); // 'list' | 'new'
  const storeId = useSelector(selectActiveStoreId);
  useActiveStore();

  return (
    <div className="p-4 pb-8 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">Cross-branch customer returns</p>
        {storeId && (
          <Button
            size="sm"
            variant={view === 'new' ? 'outline' : 'default'}
            className="gap-1.5 shrink-0"
            onClick={() => setView((v) => (v === 'new' ? 'list' : 'new'))}
          >
            {view === 'new' ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><Plus className="w-3.5 h-3.5" /> New</>}
          </Button>
        )}
      </div>

      {!storeId && (
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to view interstore returns.</p>
        </div>
      )}

      {storeId && view === 'list' && <InterstoreReturnList />}

      {storeId && view === 'new' && (
        <div className="rounded-xl border border-border bg-card p-4">
          <InterstoreReturnCreateForm onDone={() => setView('list')} />
        </div>
      )}
    </div>
  );
}

export default function TransfersPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <TransfersScreen />
    </Suspense>
  );
}
