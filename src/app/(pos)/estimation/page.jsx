'use client';

import { Suspense, useState } from 'react';
import { useSelector }        from 'react-redux';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver }        from '@hookform/resolvers/zod';
import { z }                  from 'zod';
import { toast }              from 'sonner';
import { FileText, ChevronRight, RefreshCw, Plus, X, Check, Ban, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

import { useEstimations } from '@/hooks/estimation/useEstimationList';
import {
  useCreateEstimation, usePostEstimation, useCancelEstimation,
} from '@/hooks/estimation/useEstimationMutations';
import ItemSearchPicker        from '@/components/features/transactions/ItemSearchPicker';
import CustomEstimateForm      from '@/components/features/estimation/CustomEstimateForm';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { buildTransactionHeaderFields } from '@/services/transactionHeaderService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectCartCustomerId, selectCartCustomerName, selectCartCustomerMobile } from '@/store/slices/cartSlice';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString, formatDatePadded } from '@/lib/dateUtils';
import { formatAmountOrDash } from '@/lib/priceUtils';

import PageLoader from '@/components/shared/PageLoader';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import CustomerAttachedBanner from '@/components/shared/CustomerAttachedBanner';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';

const formatINR = formatAmountOrDash;
const formatDate = formatDatePadded;

function getErrorMessage(error) {
  return (
    error?.response?.data?.Message ??
    error?.response?.data?.message ??
    error?.message ??
    'Something went wrong.'
  );
}

function FormField({ label, required, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label} {required && <span className="text-destructive">*</span>}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error.message}</p>}
    </div>
  );
}

// ─── New Estimation form ────────────────────────────────────────────────────────

const estimationSchema = z.object({
  document_date: z.string().min(1, 'Required'),
  item: z.object({ item_id: z.number() }).nullable().refine((v) => v !== null, { message: 'Select an item' }),
  pieces: z.coerce.number().min(1, 'Min 1'),
  item_rate: z.coerce.number().min(0, 'Required'),
});

function EstimationNewForm({ onDone }) {
  const storeId       = useSelector(selectActiveStoreId);
  const customerId    = useSelector(selectCartCustomerId);
  const customerName  = useSelector(selectCartCustomerName);
  const customerMobile = useSelector(selectCartCustomerMobile);
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.ESTIMATION);

  const create = useCreateEstimation({ onSuccess: () => onDone() });

  const { register, handleSubmit, control, setValue, reset, formState: { errors } } = useForm({
    resolver: zodResolver(estimationSchema),
    defaultValues: { document_date: todayDateString(), item: null, pieces: 1, item_rate: '' },
  });

  const handleItemSelect = (item) => {
    setValue('item', item);
    setValue('item_rate', item.item_rate ?? '');
  };

  const onSubmit = async (data) => {
    if (!customerId) return toast.error('Assign a customer to the session before submitting.');
    if (!headerConfig.isReady) {
      if (headerConfig.isError) headerConfig.refetch();
      return toast.error(
        headerConfig.isConfigMissing
          ? "This document type isn't set up for your store yet — contact OrnaVerse support."
          : headerConfig.isError
            ? 'Store configuration failed to load — retrying now, try again in a moment.'
            : 'Store configuration is still loading — try again in a moment.'
      );
    }
    try {
      const pieces = Number(data.pieces);
      const itemRate = Number(data.item_rate);
      const amount = pieces * itemRate;
      await create.mutateAsync({
        ...buildTransactionHeaderFields({
          subTotal: amount, taxableAmount: amount, taxAmount: 0, netAmount: amount,
          pieces,
          customerId, customerName, customerMobile,
          activeStoreId: storeId,
          headerConfig,
          documentTypeId: APP_CONFIG.DOCUMENT_TYPES.ESTIMATION,
          documentDate: data.document_date,
        }),
        line_items: [{
          item_id:    data.item.item_id,
          item_code:  data.item.item_code,
          item_name:  data.item.item_name,
          pieces,
          item_rate:  itemRate,
          sub_total:  amount,
          taxable_amount: amount,
          net_amount: amount,
        }],
      });
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />

      <FormField label="Date" required error={errors.document_date}>
        <Input type="date" max={todayDateString()} {...register('document_date')} className="h-11" />
      </FormField>

      <FormField label="Item" required error={errors.item}>
        <Controller
          name="item"
          control={control}
          render={({ field }) => (
            <ItemSearchPicker
              selectedItem={field.value}
              onSelect={handleItemSelect}
              onClear={() => setValue('item', null)}
            />
          )}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-2">
        <FormField label="Pieces" required error={errors.pieces}>
          <Input type="number" inputMode="numeric" min={1} {...register('pieces')} className="h-9 text-sm" />
        </FormField>
        <FormField label="Quoted Rate (₹)" required error={errors.item_rate}>
          <Input type="number" inputMode="decimal" {...register('item_rate')} className="h-9 text-sm" />
        </FormField>
      </div>

      <Button type="submit" disabled={create.isPending || !customerId} className="h-12 mt-1">
        {create.isPending ? 'Saving Quote…' : 'Save Quote'}
      </Button>
      
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground -mt-2">
        <AlertTriangle size={13} className="shrink-0 mt-0.5 text-status-made-order" aria-hidden="true" />
        Saving is currently expected to fail once an item is added — confirmed
        a server-side issue on OrnaVerse&apos;s end, not something wrong with what
        you entered.
      </p>
    </form>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

function EstimationRow({ item, onConverted }) {
  const [showActions, setShowActions] = useState(false);
  const post   = usePostEstimation({ onSuccess: () => setShowActions(false) });
  const cancel = useCancelEstimation({ onSuccess: () => setShowActions(false) });

  const isOpen = !item.isOrdered && !item.isClosed;

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => isOpen && setShowActions((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-muted/30 active:bg-muted/50 transition-colors"
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.documentNo ?? `#${item.transactionId}`}</p>
          <p className="text-xs text-muted-foreground truncate">{item.customerName ?? 'Unknown customer'}</p>
          <p className="text-xs text-muted-foreground">{formatDate(item.documentDate)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.isOrdered && <span className="rounded-full bg-status-in-stock/10 px-2 py-0.5 text-[11px] font-medium text-status-in-stock">Converted</span>}
          {item.isClosed && !item.isOrdered && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Cancelled</span>}
          <p className="text-sm font-semibold text-foreground tabular-nums">{formatINR(item.amount)}</p>
          {isOpen && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {showActions && isOpen && (
        <div className="flex gap-2 px-4 pb-3">
          <Button
            size="sm" variant="outline" className="flex-1 gap-1.5"
            disabled={post.isPending}
            onClick={() => post.mutateAsync(item.transactionId).then(onConverted)}
          >
            <Check className="w-3.5 h-3.5" /> {post.isPending ? 'Converting…' : 'Convert to Sale'}
          </Button>
          <Button
            size="sm" variant="outline" className="flex-1 gap-1.5 text-destructive hover:text-destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutateAsync(item.transactionId)}
          >
            <Ban className="w-3.5 h-3.5" /> {cancel.isPending ? 'Cancelling…' : 'Cancel Quote'}
          </Button>
        </div>
      )}
    </div>
  );
}

function EstimationList() {
  const { items, isLoading, isError, refetch } = useEstimations({});

  if (isLoading) return <ListRowsSkeleton />;

  if (isError) return (
    <div className="flex flex-col items-center gap-3 py-12">
      <p className="text-sm text-muted-foreground">Failed to load quotations.</p>
      <button onClick={refetch} className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );

  if (!items.length) return <p className="text-sm text-muted-foreground text-center py-12">No quotations found.</p>;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {items.map((item) => (
        <EstimationRow key={item.transactionId} item={item} onConverted={refetch} />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function EstimationScreen() {
  const storeId = useSelector((state) => state.store.activeStoreId);
  const searchParams = useSearchParams();
  // Only ever read once, at mount — this page is always freshly navigated to
  // (e.g. the dashboard's "?view=custom" quick-action link), never given a
  // changed ?view while already mounted, so a lazy initializer is correct
  // here and avoids the extra render pass a mount-time setState-in-effect
  // would otherwise trigger.
  const [view, setView] = useState(() => (searchParams.get('view') === 'custom' ? 'custom' : 'list'));

  return (
    <div className="p-4 pb-8 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">Price quotes before a purchase</p>
        {storeId && view !== 'list' && (
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setView('list')}>
            <X className="w-3.5 h-3.5" /> Cancel
          </Button>
        )}
        {storeId && view === 'list' && (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setView('custom')}>
              Custom
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setView('new')}>
              <Plus className="w-3.5 h-3.5" /> New
            </Button>
          </div>
        )}
      </div>

      {!storeId && (
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to view quotations.</p>
        </div>
      )}

      {storeId && view === 'list' && <EstimationList />}

      {storeId && view === 'new' && (
        <div className="rounded-xl border border-border bg-card p-4">
          <EstimationNewForm onDone={() => setView('list')} />
        </div>
      )}

      {storeId && view === 'custom' && (
        <div className="rounded-xl border border-border bg-card p-4">
          <CustomEstimateForm onDone={() => setView('list')} />
        </div>
      )}
    </div>
  );
}

export default function EstimationPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <EstimationScreen />
    </Suspense>
  );
}
