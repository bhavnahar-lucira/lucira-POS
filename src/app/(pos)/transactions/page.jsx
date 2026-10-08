'use client';

import { Suspense, useState, useCallback } from 'react';
import { useQuery }                        from '@tanstack/react-query';
import { useSelector }                     from 'react-redux';
import { useRouter, useSearchParams }      from 'next/navigation';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver }                     from '@hookform/resolvers/zod';
import { z }                               from 'zod';
import { toast }                           from 'sonner';
import {
  RotateCcw,
  CreditCard,
  FileText,
  ArrowLeftRight,
  ShoppingBag,
  Coins,
  ChevronRight,
  RefreshCw,
  Plus,
  X,
  Calendar,
  User,
  Hash,
  IndianRupee,
  AlertCircle,
  Check,
  Ban,
  Repeat,
}                                          from 'lucide-react';

import {
  useReturns,
  useRefunds,
  useCreditNotes,
  useExchanges,
  useBuybacks,
  useURDPurchases,
}                                          from '@/hooks/transactions/useTransactionLists';
import {
  useCreateReturn,     usePostReturn,     useCancelReturn,
  useCreateRefund,                        useDeleteRefund,
  useCreateCreditNote, usePostCreditNote, useCancelCreditNote,
  useCreateExchange,   usePostExchange,   useCancelExchange,
  useCreateBuyback,    usePostBuyback,    useCancelBuyback,
  useCreateURDPurchase,usePostURDPurchase,useCancelURDPurchase,
}                                          from '@/hooks/transactions/useTransactionMutations';
import ConfirmDialog                      from '@/components/shared/ConfirmDialog';
import PaymentStatusBadge                  from '@/components/shared/PaymentStatusBadge';
import InvoiceReportButton                 from '@/components/features/checkout/InvoiceReportButton';
import { usePaymentModes }                from '@/hooks/checkout/usePaymentModes';
import { paymentRequiresBank }             from '@/lib/checkout/paymentModeRules';
import { useURDMasterItem }                from '@/hooks/transactions/useURDMasterItem';
import SalesPersonSelect                   from '@/components/features/checkout/SalesPersonSelect';
import { useSoldItems }                    from '@/hooks/transactions/useSoldItems';
import { useCompliancePolicy }             from '@/hooks/transactions/useCompliancePolicy';
import { useCustomerCredits }              from '@/hooks/transactions/useCustomerCredits';
import { useOrderHeaderConfig }            from '@/hooks/checkout/useOrderHeaderConfig';
import { buildTransactionHeaderFields }    from '@/services/transactionHeaderService';
import { calculateReturnItems, calculateBuybackItems, calculateExchangeItems, calculateURDItems } from '@/services/returnItemsService';
import {
  calculateInterstoreReturnItems, mapReturnLineToInterstoreReturnLine,
  createInterstoreReturnWithPhotos,
} from '@/services/interstoreReturnService';
import EmptyState                          from '@/components/shared/EmptyState';
import ErrorState                          from '@/components/shared/ErrorState';
import InlineLoader                        from '@/components/shared/InlineLoader';
import LinePhotoPicker                     from '@/components/shared/LinePhotoPicker';
import ItemSearchPicker                    from '@/components/features/transactions/ItemSearchPicker';
import { useURDItemSearch }                 from '@/hooks/transactions/useURDItemSearch';
import { URD_CATEGORY }                     from '@/services/itemService';
import { selectActiveStoreId }            from '@/store/slices/storeSlice';
import { selectCartCustomerId, selectCartCustomerName, selectCartCustomerMobile } from '@/store/slices/cartSlice';
import APP_CONFIG                         from '@/constants/appConfig';
import { todayDateString, formatDatePadded, resolveDocumentDateTime } from '@/lib/dateUtils';
import { formatAmountOrDash, roundToNearestRupee } from '@/lib/priceUtils';

import PageLoader                          from '@/components/shared/PageLoader';
import PaymentModeSelect                   from '@/components/shared/PaymentModeSelect';
import PillTabs                            from '@/components/shared/PillTabs';
import RemoveLineItemButton                from '@/components/shared/RemoveLineItemButton';
import CustomerAttachedBanner               from '@/components/shared/CustomerAttachedBanner';
import ListRowsSkeleton                    from '@/components/shared/ListRowsSkeleton';
import { Button }                          from '@/components/ui/button';
import { Input }                           from '@/components/ui/input';
import { Label }                           from '@/components/ui/label';
import { Switch }                          from '@/components/ui/switch';

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
const SOLD_ITEM_TRANSACTION_TYPE = { RETURN: 1, EXCHANGE: 2, BUYBACK: 2 };

const SOLD_ITEM_FLOWS = {
  return: {
    documentTypeId: APP_CONFIG.DOCUMENT_TYPES.RETURN,
    transactionType: SOLD_ITEM_TRANSACTION_TYPE.RETURN,
    interstoreTransactionType: APP_CONFIG.INTERSTORE_RETURN_TRANSACTION_TYPE.RETURN,
    priceItems:     calculateReturnItems,
    modeLabel:      'Return for Refund',
    modeHint:       'Customer wants a refund for a previous purchase',
    modeIcon:       RotateCcw,
    itemsLabel:     'Items Being Returned',
    emptyTitle:     'No purchases found for this customer.',
    emptyHint:      'Only previously sold items can be returned.',
    totalLabel:     'Total Return Amount',
    submitLabel:    'Submit Return',
    busyLabel:      'Processing Return…',
    allowBackdatedEntry: false,
  },
  buyback: {
    documentTypeId: APP_CONFIG.DOCUMENT_TYPES.BUYBACK,
    transactionType: SOLD_ITEM_TRANSACTION_TYPE.BUYBACK,
    interstoreTransactionType: APP_CONFIG.INTERSTORE_RETURN_TRANSACTION_TYPE.BUYBACK,
    priceItems:     calculateBuybackItems,
    modeLabel:      'Buy Back Item',
    modeHint:       'We purchase the item back from the customer',
    modeIcon:       ShoppingBag,
    itemsLabel:     'Items Being Bought Back',
    emptyTitle:     'No purchases found for this customer.',
    emptyHint:      'Buy Back here covers pieces this store previously sold.',
    totalLabel:     'Total Buy Back Amount',
    submitLabel:    'Submit Buy Back',
    busyLabel:      'Processing Buy Back…',
    allowBackdatedEntry: true,
  },
  exchange: {
    documentTypeId: APP_CONFIG.DOCUMENT_TYPES.EXCHANGE,
    transactionType: SOLD_ITEM_TRANSACTION_TYPE.EXCHANGE,
    interstoreTransactionType: APP_CONFIG.INTERSTORE_RETURN_TRANSACTION_TYPE.EXCHANGE,
    priceItems:     calculateExchangeItems,
    modeLabel:      'Exchange for Another Item',
    modeHint:       'Swap for a different item',
    modeIcon:       ArrowLeftRight,
    itemsLabel:     'Items Being Exchanged',
    emptyTitle:     'No purchases found for this customer.',
    emptyHint:      'Only previously sold pieces can be exchanged.',
    totalLabel:     'Exchange Credit',
    submitLabel:    'Submit Exchange',
    busyLabel:      'Processing Exchange…',
    allowBackdatedEntry: true,
    helperText: 'This raises store credit for the customer. Ring up the replacement piece as a normal sale and pay with that credit.',
  },
};

const soldItemFlowSchema = z.object({
  document_date: z.string().min(1, 'Required'),
  selected_keys: z.array(z.string()).min(1, 'Select at least one item'),
});
const soldItemKey = (row) => `${row.document_no ?? ''}#${row.item_line_no ?? ''}`;

function SoldItemFlowForm({ flow, onDone }) {
  const [mode, setMode] = useState(flow);
  const config         = SOLD_ITEM_FLOWS[mode];
  const storeId        = useSelector(selectActiveStoreId);
  const customerId     = useSelector(selectCartCustomerId);
  const customerName   = useSelector(selectCartCustomerName);
  const headerConfig   = useOrderHeaderConfig(config.documentTypeId);
  const { soldItems: allSoldItems, isLoading: soldLoading, isError: soldError, refetch: refetchSold } =
    useSoldItems(customerId, config.transactionType);
  const { salesReturnDays } = useCompliancePolicy();

  // COMPLIANCE (2026-10-05, reported live): OrnaVerse's own Return/Create
  // rejects an item still within the tenant's sales_return_days window
  // ("... is outside the return window") — confirmed this is a real,
  // server-enforced compliance rule (Services/Costing/Policy/List, policy
  // "Compliance"), not a bug. But Buyback/Exchange have no such check
  // server-side, so an item could silently route around a Return's
  // cooling-off period via Buyback/Exchange instead — reported directly:
  // "the product ordered wont be visible in buyback and exchange until it
  // is out of the return window". Return itself stays unfiltered (its own
  // server call already enforces this correctly); only hide the item from
  // Buyback/Exchange's own picker.
  const now = Date.now();
  const withinReturnWindow = (row) => {
    if (salesReturnDays == null || !row.document_date) return false;
    const soldAt = new Date(row.document_date).getTime();
    if (isNaN(soldAt)) return false;
    const daysSinceSale = (now - soldAt) / (24 * 60 * 60 * 1000);
    return daysSinceSale < salesReturnDays;
  };
  const soldItems = mode === 'return' ? allSoldItems : allSoldItems.filter((r) => !withinReturnWindow(r));
  const hiddenForWindowCount = allSoldItems.length - soldItems.length;

  // PRICE PREVIEW (2026-10-05, reported live: "buyback and exchange price in
  // POS is different and on ornaverse is different"). Root cause: Buyback
  // and Exchange each carry a real OrnaVerse policy (Services/Costing/
  // Policy/List, policy_code "BuyBack"/"Exchange") that revalues each
  // component — on this tenant 90% stone / 100% metal / 0% making charges
  // for BuyBack, 100% stone / 100% metal / 0% making charges (no tax) for
  // Exchange — which SetBuybackItems/SetExchangeItems already applies
  // server-side (confirmed live: diamond rate came back at exactly 0.9× the
  // original sale's rate). The Create payload was always built from that
  // real priced response, so the CREATED document was always correct — but
  // this picker and the running total were showing the raw original sale's
  // net_amount, which doesn't match what actually gets charged/credited.
  // Return needs no such preview — confirmed live its priced net_amount
  // always equals the raw sale net_amount (a return reverses the sale 1:1).
  const needsPricePreview = mode !== 'return';
  const pricePreview = useQuery({
    queryKey: ['transactions', 'sold-items-price-preview', mode, storeId, soldItems.map(soldItemKey)],
    queryFn: () => config.priceItems({ items: soldItems, documentDate: resolveDocumentDateTime(todayDateString()) }),
    enabled: needsPricePreview && soldItems.length > 0,
    staleTime: APP_CONFIG.STALE_TIME.STOCK,
  });
  const pricedByKey = new Map((pricePreview.data ?? []).map((row) => [soldItemKey(row), row]));
  const displayAmountFor = (row) =>
    needsPricePreview ? (pricedByKey.get(soldItemKey(row))?.net_amount ?? row.net_amount) : row.net_amount;

  const createReturnDoc   = useCreateReturn({ onSuccess: () => {} });
  const postReturnDoc     = usePostReturn();
  const createBuybackDoc  = useCreateBuyback({ onSuccess: () => {} });
  const postBuybackDoc    = usePostBuyback();
  const createExchangeDoc = useCreateExchange({ onSuccess: () => {} });
  const postExchangeDoc   = usePostExchange();
  const byMode = {
    return:   { create: createReturnDoc,   post: postReturnDoc },
    buyback:  { create: createBuybackDoc,  post: postBuybackDoc },
    exchange: { create: createExchangeDoc, post: postExchangeDoc },
  };
  const createDoc = byMode[mode].create;
  const postDoc   = byMode[mode].post;
  const [isPricing, setIsPricing] = useState(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    resolver: zodResolver(soldItemFlowSchema),
    defaultValues: { document_date: todayDateString(), selected_keys: [] },
  });

  const selectedKeys = watch('selected_keys');
  const selectedRows = soldItems.filter((r) => selectedKeys.includes(soldItemKey(r)));
  const isCrossStore = (row) => row.company_id != null && row.company_id !== storeId;
  const crossStoreRows = selectedRows.filter(isCrossStore);
  const sameStoreRows  = selectedRows.filter((r) => !isCrossStore(r));
  const [photosByKey, setPhotosByKey] = useState({});
  const setPhotoForRow = (row, file) =>
    setPhotosByKey((prev) => ({ ...prev, [soldItemKey(row)]: file }));

  const toggleItem = (row) => {
    const key = soldItemKey(row);
    setValue(
      'selected_keys',
      selectedKeys.includes(key)
        ? selectedKeys.filter((k) => k !== key)
        : [...selectedKeys, key],
      { shouldValidate: true },
    );
  };

  const onSubmit = async (data) => {
    if (!customerId) return toast.error('Assign a customer to the session first.');
    const missingPhoto = crossStoreRows.find((row) => !photosByKey[soldItemKey(row)]);
    if (missingPhoto) {
      return toast.error('Attach a photo for every item bought at a different store before submitting.');
    }
    if (sameStoreRows.length > 0 && !headerConfig.isReady) {
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
      setIsPricing(true);
      if (crossStoreRows.length > 0) {
        const rowsByOrigin = new Map();
        for (const row of crossStoreRows) {
          const list = rowsByOrigin.get(row.company_id) ?? [];
          list.push(row);
          rowsByOrigin.set(row.company_id, list);
        }
        for (const [originCompanyId, rows] of rowsByOrigin) {
          const pricedLines = await calculateInterstoreReturnItems({
            items: rows,
            documentDate: resolveDocumentDateTime(data.document_date),
          });
          if (pricedLines.length !== rows.length) {
            throw new Error('Could not price one or more items bought at a different store.');
          }
          const lineItems = pricedLines.map((line, i) => mapReturnLineToInterstoreReturnLine(line, i + 1));
          await createInterstoreReturnWithPhotos({
            partyId: customerId, partyName: customerName,
            originCompanyId, receivingCompanyId: storeId,
            documentDate: resolveDocumentDateTime(data.document_date).toISOString(),
            transactionType: config.interstoreTransactionType,
            lineItems,
            photosByLineIndex: rows.map((row) => photosByKey[soldItemKey(row)]),
            headerConfig: { financialYearId: null, isDocumentNumberEditable: false, numberOfBackdatedDays: 365 },
          });
        }
      }

      if (sameStoreRows.length > 0) {
        const line_items = await config.priceItems({
          items: sameStoreRows,
          documentDate: resolveDocumentDateTime(data.document_date),
        });
        if (!line_items.length) throw new Error('Could not price the selected items.');
        const sum = (f) => +line_items.reduce((s, li) => s + (li[f] || li[`base_${f}`] || 0), 0).toFixed(2);
        const subTotal = sum('sub_total');
        const taxAmount = sum('tax_amount');
        const netRaw = sum('net_amount');

        const createRes = await createDoc.mutateAsync({
          ...buildTransactionHeaderFields({
            subTotal, taxableAmount: subTotal, taxAmount, netAmount: netRaw,
            pieces: sum('pieces'), weight: sum('weight'), netWeight: sum('net_weight'),
            customerId, customerName,
            activeStoreId: storeId,
            headerConfig,
            documentTypeId: config.documentTypeId,
            receiptAmount: roundToNearestRupee(netRaw),
            documentDate: resolveDocumentDateTime(data.document_date).toISOString(),
            forReturn: true,
            allowBackdatedEntry: config.allowBackdatedEntry,
          }),
          line_items,
          remark: '',
        });
        const transactionId = createRes?.EntityId;
        if (!transactionId) throw new Error('Creation failed — no EntityId returned.');
        if (!headerConfig.autoPosting) {
          await postDoc.mutateAsync(transactionId);
        }
      }

      setIsPricing(false);
      reset();
      setPhotosByKey({});
      onDone();
    } catch (err) {
      setIsPricing(false);
      toast.error(getErrorMessage(err));
    }
  };

  const total = selectedRows.reduce((s, r) => s + (displayAmountFor(r) ?? 0), 0);

  const isSubmitting = isPricing || createDoc.isPending || postDoc.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />
      <div className="flex flex-col gap-2">
        <Label>What&apos;s happening?</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {Object.entries(SOLD_ITEM_FLOWS).map(([key, cfg]) => {
            const ModeIcon = cfg.modeIcon;
            const isActive = key === mode;
            const locked   = selectedRows.length > 0 && !isActive;
            return (
              <button
                type="button"
                key={key}
                disabled={locked}
                onClick={() => setMode(key)}
                aria-pressed={isActive}
                className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors min-h-[44px] ${
                  isActive
                    ? 'border-primary bg-primary/5'
                    : locked
                      ? 'cursor-not-allowed border-border bg-muted/40 opacity-50'
                      : 'border-border bg-muted hover:bg-muted/70'
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <ModeIcon size={14} aria-hidden="true" className="shrink-0" />
                  {cfg.modeLabel}
                </span>
                <span className="text-xs text-muted-foreground">{cfg.modeHint}</span>
              </button>
            );
          })}
        </div>
        {selectedRows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Remove the selected items to switch between Return, Exchange and Buy Back.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          {config.itemsLabel} <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Pick from what this customer has purchased — tap to select.
        </p>
        {mode !== 'return' && hiddenForWindowCount > 0 && (
          <p className="text-xs text-muted-foreground -mt-1">
            {hiddenForWindowCount} item{hiddenForWindowCount > 1 ? 's are' : ' is'} still within the
            {' '}{salesReturnDays}-day return window and {hiddenForWindowCount > 1 ? "aren't" : "isn't"} shown
            here — use Return for those instead.
          </p>
        )}
        {needsPricePreview && pricePreview.isFetching && (
          <p className="text-xs text-muted-foreground -mt-1">Calculating current {mode === 'buyback' ? 'buy back' : 'exchange'} value…</p>
        )}

        {!customerId ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Assign a customer to see their purchases.
          </p>
        ) : soldLoading ? (
          <InlineLoader className="py-6" label="Loading purchases…" />
        ) : soldError ? (
          <ErrorState className="py-6" title="Couldn't load purchases." onRetry={() => refetchSold()} />
        ) : soldItems.length === 0 ? (
          <EmptyState
            className="border-0 py-6"
            icon={RotateCcw}
            title={hiddenForWindowCount > 0 ? 'All purchases are still within the return window.' : config.emptyTitle}
            description={hiddenForWindowCount > 0
              ? `These items can only be returned (not bought back or exchanged) until their ${salesReturnDays}-day return window passes.`
              : config.emptyHint}
          />
        ) : (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
            {soldItems.map((row) => {
              const key = soldItemKey(row);
              const isSelected = selectedKeys.includes(key);
              const crossStore = isCrossStore(row);
              return (
                <div key={key} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => toggleItem(row)}
                    aria-pressed={isSelected}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors min-h-[44px] ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-muted hover:bg-muted/70'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="truncate text-sm font-medium text-foreground">
                        {row.item_name ?? row.item_code ?? `Item ${row.item_line_no}`}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.sku} · {row.document_no}
                      </span>
                      {crossStore && (
                        <span className="text-xs font-medium text-status-made-order">
                          Origin store {row.company_code ?? row.company_name ?? 'different'} · photo required
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatINR(displayAmountFor(row))}
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                    </div>
                  </button>
                  {isSelected && crossStore && (
                    <LinePhotoPicker
                      file={photosByKey[key]}
                      onChange={(file) => setPhotoForRow(row, file)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {errors.selected_keys && (
          <p className="text-xs text-destructive">{errors.selected_keys.message}</p>
        )}
      </div>

      {total > 0 && (
        <div className="flex justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium">
          <span className="text-muted-foreground">{config.totalLabel}</span>
          <span className="text-foreground">{formatINR(total)}</span>
        </div>
      )}

      {config.helperText && selectedRows.length > 0 && (
        <p className="rounded-xl border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
          {config.helperText}
        </p>
      )}

      <Button
        type="submit"
        disabled={
          isSubmitting || !customerId || selectedRows.length === 0 ||
          crossStoreRows.some((row) => !photosByKey[soldItemKey(row)])
        }
        className="h-12 mt-1"
      >
        {isSubmitting ? config.busyLabel : config.submitLabel}
      </Button>
    </form>
  );
}

const URD_PICKER_CATEGORIES = [
  { value: URD_CATEGORY.JEWELLERY, label: 'Jewellery' },
  { value: URD_CATEGORY.METAL,     label: 'Metal' },
];

const METAL_TYPE_CONFIGS = {
  urd: {
    pickerMode:  'search',
    createHook:  useCreateURDPurchase,
    postHook:    usePostURDPurchase,
    priceItems:  calculateURDItems,
    submitLabel: 'Submit URD Purchase',
    processingLabel: 'Processing Purchase…',
    documentTypeId: APP_CONFIG.DOCUMENT_TYPES.URD_PURCHASE,
  },
};

function buildMetalLineItemSchema(config) {
  const shape = {
    weight: z.coerce.number().min(0.001, 'Required'),
    purity: z.coerce.number().min(0, 'Required'),
  };
  if (config.pickerMode === 'search') {
    shape.item = z.object({ item_id: z.number() }).nullable()
      .refine((v) => v !== null, { message: 'Select an item' });
    shape.baseRow = z.any();
  }
  return z.object(shape);
}

function buildMetalFormSchema(config) {
  return z.object({
    document_date:   z.string().min(1, 'Required'),
    sales_person_id: z.coerce.number().min(1, 'Select a sales person'),
    line_items:      z.array(buildMetalLineItemSchema(config)).min(1, 'Add at least one item'),
  });
}

function emptyMetalLineItem(config) {
  const item = { weight: '', purity: '' };
  if (config.pickerMode === 'search') item.item = null;
  return item;
}

function MetalLineItemForm({ type, onDone }) {
  const config = METAL_TYPE_CONFIGS[type];
  const storeId      = useSelector(selectActiveStoreId);
  const customerId   = useSelector(selectCartCustomerId);
  const customerName = useSelector(selectCartCustomerName);
  const customerMobile = useSelector(selectCartCustomerMobile);
  const { paymentModes, isLoading: modesLoading } = usePaymentModes();
  const { item: urdItem, isLoading: urdItemLoading } = useURDMasterItem('GOLD');
  const headerConfig = useOrderHeaderConfig(config.documentTypeId);

  const create = config.createHook({ onSuccess: () => {} });
  const post   = config.postHook();

  const schema = buildMetalFormSchema(config);

  const { register, handleSubmit, control, watch, getValues, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      document_date: todayDateString(),
      sales_person_id: '',
      line_items: config.pickerMode === 'search' ? [] : [emptyMetalLineItem(config)],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' });
  const watchedItems = watch('line_items');
  const [showPicker, setShowPicker] = useState(false);
  const [addingItems, setAddingItems] = useState(false);
  const handleAddItems = async (items) => {
    setAddingItems(true);
    try {
      const baseRows = await config.priceItems({
        items, documentDate: resolveDocumentDateTime(getValues('document_date')),
      });
      if (baseRows.length !== items.length) {
        throw new Error('Live pricing failed — the server priced a different number of items than were sent.');
      }
      baseRows.forEach((baseRow, i) => {
        const item = items[i];
        append({
          item, baseRow,
          weight: item.weight || item.net_weight || '',
          purity: item.purity ?? '',
        });
      });
      setShowPicker(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setAddingItems(false);
    }
  };
  const pricedPreview = watchedItems.map((i) => {
    if (!i.baseRow) return null;
    const weight = Number(i.weight) || 0;
    const purity = Number(i.purity) || 0;
    const pureWeight = +(weight * purity).toFixed(3);
    const amount = +(pureWeight * (i.baseRow.item_rate || 0)).toFixed(2);
    return {
      ...i.baseRow,
      weight, net_weight: weight, purity, pure_weight: pureWeight,
      sub_total: amount, net_amount: amount,
      base_sub_total: amount, base_net_amount: amount,
      taxable_amount: amount, tax_amount: 0, base_tax_amount: 0,
    };
  });
  const total = pricedPreview.reduce((sum, row) => sum + (Number(row?.net_amount) || 0), 0);

  const onSubmit = async (data) => {
    if (!customerId) return toast.error('Assign a customer to the session before submitting.');
    if (config.pickerMode === 'fixed' && !urdItem) {
      return toast.error('URD Gold master item is still loading — try again in a moment.');
    }
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
    if (pricedPreview.some((row) => !row)) {
      return toast.error('Still finishing pricing for one or more items — try again in a moment.');
    }
    try {
      const salesPersonId = Number(data.sales_person_id);
      const line_items = pricedPreview.map((row) => ({
        ...row,
        party_id:   customerId,
        company_id: storeId,
        location_id: 1,
        is_urd: true,
        is_acknowledged: true,
        type_of_document: 1,
        sales_person_id: salesPersonId,
      }));

      const sum = (f) => +line_items.reduce((s, li) => s + (li[f] || li[`base_${f}`] || 0), 0).toFixed(2);
      const subTotal  = sum('sub_total');
      const taxAmount = sum('tax_amount');
      const netRaw    = sum('net_amount');
      const totalWeight = sum('weight');
      const { receipt_amount: _unusedReceiptAmount, ...headerFields } = buildTransactionHeaderFields({
        subTotal, taxableAmount: subTotal, taxAmount, netAmount: netRaw,
        pieces: line_items.length, weight: totalWeight, netWeight: totalWeight,
        customerId, customerName, customerMobile,
        activeStoreId: storeId,
        headerConfig,
        documentTypeId: config.documentTypeId,
        receiptAmount: roundToNearestRupee(netRaw),
        documentDate: resolveDocumentDateTime(data.document_date).toISOString(),
        forReturn: true,
        allowBackdatedEntry: false,
      });
      const payload = {
        ...headerFields,
        sales_person_id: salesPersonId,
        line_items,
      };
      const createRes = await create.mutateAsync(payload);
      const transactionId = createRes?.EntityId;
      if (!transactionId) throw new Error('Creation failed — no EntityId returned.');
      if (!headerConfig.autoPosting) {
        await post.mutateAsync(transactionId);
      }
      reset();
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const isSubmitting = create.isPending || post.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />

      <FormField label="Sales Person" required error={errors.sales_person_id}>
        <Controller
          name="sales_person_id"
          control={control}
          render={({ field }) => (
            <SalesPersonSelect
              companyId={storeId}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Line Items <span className="text-destructive">*</span></Label>
          {config.pickerMode === 'fixed' && (
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs"
              onClick={() => append(emptyMetalLineItem(config))}>
              <Plus size={12} /> Add Item
            </Button>
          )}
          {config.pickerMode === 'search' && (
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs"
              onClick={() => setShowPicker((v) => !v)}>
              <Plus size={12} /> Add Items
            </Button>
          )}
        </div>

        {config.pickerMode === 'search' && showPicker && (
          <div className="rounded-xl border border-border bg-card p-3">
            {addingItems ? (
              <p className="text-xs text-muted-foreground">Fetching prices for selected items…</p>
            ) : (
              <ItemSearchPicker
                multiple
                onAdd={handleAddItems}
                useSearch={useURDItemSearch}
                categories={URD_PICKER_CATEGORIES}
              />
            )}
          </div>
        )}

        {fields.map((field, index) => (
          <div key={field.id} className="rounded-xl border border-border bg-muted p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
              <RemoveLineItemButton onClick={() => remove(index)} />
            </div>

            {config.pickerMode === 'search' && (
              <div className="rounded-lg border border-input bg-muted/30 px-3 py-2.5 text-sm">
                <p className="font-medium text-foreground">
                  {watchedItems[index]?.item?.item_name || watchedItems[index]?.item?.item_code}
                </p>
                <p className="text-xs text-muted-foreground">{watchedItems[index]?.item?.item_code}</p>
              </div>
            )}

            {config.pickerMode === 'fixed' && (
              <div className="rounded-lg border border-input bg-muted/30 px-3 py-2.5 text-sm">
                {urdItemLoading ? (
                  <p className="text-muted-foreground">Loading URD Gold item…</p>
                ) : urdItem ? (
                  <>
                    <p className="font-medium text-foreground">{urdItem.item_name}</p>
                    <p className="text-xs text-muted-foreground">{urdItem.item_code} · fixed item used for every old-gold purchase</p>
                  </>
                ) : (
                  <p className="text-destructive">Could not load the URD Gold master item.</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <FormField label="Weight (g)" required error={errors.line_items?.[index]?.weight}>
                <Input type="number" inputMode="decimal" step="0.001" {...register(`line_items.${index}.weight`)} className="h-9 text-sm" />
              </FormField>
              <FormField label="Purity" required error={errors.line_items?.[index]?.purity}>
                <Input type="number" inputMode="decimal" step="0.01" placeholder="e.g. 0.75" {...register(`line_items.${index}.purity`)} className="h-9 text-sm" />
              </FormField>
              
              <div className="flex flex-col justify-end gap-1 rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground">Rate (₹/g)</span>
                <span className="font-medium text-foreground">
                  {pricedPreview[index] ? formatINR(pricedPreview[index].item_rate) : '—'}
                </span>
              </div>
              <div className="flex flex-col justify-end gap-1 rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                <span className="text-xs text-muted-foreground">Amount (₹)</span>
                <span className="font-medium text-foreground">
                  {pricedPreview[index] ? formatINR(pricedPreview[index].net_amount) : '—'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="flex justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium">
          <span className="text-muted-foreground">Total</span>
          <span className="text-foreground">{formatINR(total)}</span>
        </div>
      )}

      <Button type="submit" disabled={isSubmitting || !customerId} className="h-12 mt-1">
        {isSubmitting ? config.processingLabel : config.submitLabel}
      </Button>
    </form>
  );
}

const creditNoteSchema = z.object({
  document_date:      z.string().min(1, 'Required'),
  net_amount:         z.coerce.number().min(1, 'Enter an amount'),
  ref_transaction_id: z.coerce.number().optional(),
  narration:          z.string().optional(),
});

function CreditNoteNewForm({ onDone }) {
  const storeId       = useSelector(selectActiveStoreId);
  const customerId    = useSelector(selectCartCustomerId);
  const customerName  = useSelector(selectCartCustomerName);
  const customerMobile = useSelector(selectCartCustomerMobile);
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.CREDIT_NOTE);

  const create = useCreateCreditNote({ onSuccess: () => {} });
  const post   = usePostCreditNote({ onSuccess: () => onDone() });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(creditNoteSchema),
    defaultValues: { document_date: todayDateString(), net_amount: '', ref_transaction_id: '', narration: '' },
  });

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
      const amount = Number(data.net_amount);
      const createRes = await create.mutateAsync({
        ...buildTransactionHeaderFields({
          subTotal: amount, taxableAmount: amount, taxAmount: 0, netAmount: amount,
          customerId, customerName, customerMobile,
          activeStoreId: storeId,
          headerConfig,
          documentTypeId: APP_CONFIG.DOCUMENT_TYPES.CREDIT_NOTE,
          documentDate: resolveDocumentDateTime(data.document_date).toISOString(),
        }),
        ref_transaction_id: data.ref_transaction_id ? Number(data.ref_transaction_id) : undefined,
        narration: data.narration || undefined,
      });
      const transactionId = createRes?.EntityId;
      if (!transactionId) throw new Error('Credit note creation failed — no EntityId returned.');
      if (!headerConfig.autoPosting) await post.mutateAsync(transactionId);
      onDone();
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const isSubmitting = create.isPending || post.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />

      <FormField label="Credit Amount (₹)" required error={errors.net_amount}>
        <Input type="number" inputMode="decimal" placeholder="0.00" {...register('net_amount')} className="h-11" />
      </FormField>

      <FormField label="Linked Invoice ID (optional)">
        <Input type="number" inputMode="numeric" placeholder="transaction_id, if related to a specific invoice" {...register('ref_transaction_id')} className="h-11" />
      </FormField>

      <FormField label="Narration (optional)">
        <Input placeholder="Reason for issuing credit" {...register('narration')} className="h-11" />
      </FormField>

      <Button type="submit" disabled={isSubmitting || !customerId} className="h-12 mt-1">
        {isSubmitting ? 'Processing Credit Note…' : 'Issue Credit Note'}
      </Button>
    </form>
  );
}

const refundSchema = z.object({
  document_date: z.string().min(1, 'Required'),
  mode_id:       z.coerce.number().min(1, 'Select how the money is paid out'),
  credit_keys:   z.array(z.number()).min(1, 'Select at least one credit to refund'),
  ref_no: z.string().optional(),
});

function RefundNewForm({ onDone }) {
  const storeId      = useSelector(selectActiveStoreId);
  const customerId   = useSelector(selectCartCustomerId);
  const customerName = useSelector(selectCartCustomerName);
  const { paymentModes, isLoading: modesLoading } = usePaymentModes();
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.REFUND);
  const { credits, isLoading: creditsLoading, isError: creditsError, refetch: refetchCredits } =
    useCustomerCredits(customerId);

  const create = useCreateRefund({ onSuccess: () => onDone() });

  const { register, handleSubmit, control, watch, setValue, reset, formState: { errors } } = useForm({
    resolver: zodResolver(refundSchema),
    defaultValues: { document_date: todayDateString(), mode_id: '', credit_keys: [], ref_no: '' },
  });

  const creditKeys = watch('credit_keys');
  const selectedCredits = credits.filter((c) => creditKeys.includes(c.transaction_id));
  const total = +selectedCredits.reduce((s, c) => s + (c.amount ?? 0), 0).toFixed(2);

  const toggleCredit = (credit) => {
    const id = credit.transaction_id;
    setValue(
      'credit_keys',
      creditKeys.includes(id) ? creditKeys.filter((k) => k !== id) : [...creditKeys, id],
      { shouldValidate: true },
    );
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
      const mode = paymentModes.find((m) => m.modeId === Number(data.mode_id));
      if (mode && paymentRequiresBank(mode) && !data.ref_no?.trim()) {
        return toast.error('Enter a reference number for this payout.');
      }
      await create.mutateAsync({
        partyId: customerId,
        partyName: customerName,
        activeStoreId: storeId,
        financialYearId: headerConfig.financialYearId,
        documentDate: resolveDocumentDateTime(data.document_date).toISOString(),
        credits: selectedCredits.map((credit) => ({ credit, amount: credit.amount })),
        payout: {
          modeId:   Number(data.mode_id),
          ledgerId: mode?.ledgerId,
          amount:   total,
          refNo:    data.ref_no?.trim() || undefined,
        },
      });
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const isSubmitting = create.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />

      <div className="flex flex-col gap-2">
        <Label>
          Credit to Refund <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground -mt-1">
          A refund pays out credit from a return, exchange or buy back.
        </p>

        {!customerId ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Assign a customer to see their credit.
          </p>
        ) : creditsLoading ? (
          <InlineLoader className="py-6" label="Loading credit…" />
        ) : creditsError ? (
          <ErrorState className="py-6" title="Couldn't load credit." onRetry={() => refetchCredits()} />
        ) : credits.length === 0 ? (
          <EmptyState
            className="border-0 py-6"
            icon={CreditCard}
            title="No outstanding credit."
            description="Raise a return, exchange or buy back first — a refund settles the credit it creates."
          />
        ) : (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
            {credits.map((c) => {
              const isSelected = creditKeys.includes(c.transaction_id);
              return (
                <button
                  type="button"
                  key={c.transaction_id}
                  onClick={() => toggleCredit(c)}
                  aria-pressed={isSelected}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors min-h-[44px] ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border bg-muted hover:bg-muted/70'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate text-sm font-medium text-foreground">{c.document_no}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.document_name} · {formatDate(c.document_date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatINR(c.amount)}
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {errors.credit_keys && <p className="text-xs text-destructive">{errors.credit_keys.message}</p>}
      </div>

      {total > 0 && (
        <div className="flex justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium">
          <span className="text-muted-foreground">Total Refund</span>
          <span className="text-foreground">{formatINR(total)}</span>
        </div>
      )}

      <FormField label="Paid Out By" required error={errors.mode_id}>
        <PaymentModeSelect
          control={control}
          name="mode_id"
          paymentModes={paymentModes}
          modesLoading={modesLoading}
          refFieldName="ref_no"
        />
      </FormField>

      <Button
        type="submit"
        disabled={isSubmitting || !customerId || selectedCredits.length === 0}
        className="h-12 mt-1"
      >
        {isSubmitting ? 'Processing Refund…' : 'Submit Refund'}
      </Button>
      
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground -mt-2">
        <AlertCircle size={13} className="shrink-0 mt-0.5 text-status-made-order" aria-hidden="true" />
        The selected credit(s) may still show as outstanding after this — OrnaVerse
        doesn&apos;t reliably mark them settled yet. Track paid-out refunds manually
        until that&apos;s confirmed fixed.
      </p>
    </form>
  );
}

const CANCEL_LABEL_BY_TYPE = {
  returns:        'Cancel Return',
  refunds:        'Delete Refund',
  'credit-notes': 'Cancel Credit Note',
  exchange:       'Cancel Exchange',
  buyback:        'Cancel Buyback',
  urd:            'Cancel URD Purchase',
};

// Print — reuses the exact same report-picker/printer checkout already uses
// for Invoice (InvoiceReportButton is generic over documentId); just the
// right document_id + label per transaction type. Self-hides if OrnaVerse
// has no report configured for that document type (see component's own
// `reports.length === 0` check), so adding it here is zero-risk even for a
// type that turns out to have none.
const PRINT_CONFIG_BY_TYPE = {
  returns:        { documentId: APP_CONFIG.DOCUMENT_TYPES.RETURN,       label: 'Return' },
  refunds:        { documentId: APP_CONFIG.DOCUMENT_TYPES.REFUND,       label: 'Refund' },
  'credit-notes': { documentId: APP_CONFIG.DOCUMENT_TYPES.CREDIT_NOTE,  label: 'Credit Note' },
  exchange:       { documentId: APP_CONFIG.DOCUMENT_TYPES.EXCHANGE,     label: 'Exchange' },
  buyback:        { documentId: APP_CONFIG.DOCUMENT_TYPES.BUYBACK,      label: 'Buy Back' },
  urd:            { documentId: APP_CONFIG.DOCUMENT_TYPES.URD_PURCHASE, label: 'URD Purchase' },
};

function TransactionDetailSheet({ transaction, type, onClose }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelReturn     = useCancelReturn({ onSuccess: onClose });
  const deleteRefund     = useDeleteRefund({ onSuccess: onClose });
  const cancelCreditNote = useCancelCreditNote({ onSuccess: onClose });
  const cancelExchange   = useCancelExchange({ onSuccess: onClose });
  const cancelBuyback    = useCancelBuyback({ onSuccess: onClose });
  const cancelURDPurchase = useCancelURDPurchase({ onSuccess: onClose });

  const mutationByType = {
    returns: cancelReturn, refunds: deleteRefund, 'credit-notes': cancelCreditNote,
    exchange: cancelExchange, buyback: cancelBuyback, urd: cancelURDPurchase,
  };

  if (!transaction) return null;
  const raw = transaction.raw ?? {};

  const cancelLabel = transaction.status !== 'cancelled' ? CANCEL_LABEL_BY_TYPE[type] : null;
  const cancelMutation = mutationByType[type];

  const headerRows = [
    { icon: Hash,        label: 'Document No', value: transaction.documentNo ?? `#${transaction.transactionId}` },
    { icon: Calendar,    label: 'Date',        value: formatDate(transaction.documentDate) },
    { icon: User,        label: 'Customer',    value: transaction.customerName ?? '—' },
    { icon: IndianRupee, label: 'Amount',      value: formatINR(transaction.amount) },
    ...(raw.posted_by_name
      ? [{ icon: AlertCircle, label: 'Posted By', value: raw.posted_by_name }]
      : []),
  ];

  const skipKeys = new Set(['transaction_id', 'document_no', 'document_date', 'party_id', 'party_name', 'net_amount', 'company_id', 'current_company_id', 'document_status', 'posted_by_name']);

  const extraRows = Object.entries(raw)
    .filter(([k, v]) => !skipKeys.has(k) && v !== null && v !== undefined && v !== 'NA' && v !== '' && typeof v !== 'object')
    .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: String(v) }));

  const printConfig = PRINT_CONFIG_BY_TYPE[type];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-50 flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground">Transaction</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{transaction.documentNo ?? `#${transaction.transactionId}`}</p>
              {transaction.status && <PaymentStatusBadge status={transaction.status} size="sm" />}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
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
          {extraRows.length > 0 && (
            <div className="flex flex-col gap-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Additional Details</p>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {extraRows.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <p className="text-xs text-muted-foreground capitalize">{label}</p>
                    <p className="text-xs font-medium text-foreground text-right max-w-[55%] break-words">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {(printConfig || cancelLabel) && (
          <div className="border-t border-border p-4 flex flex-col gap-2">
            {printConfig && (
              <InvoiceReportButton
                transactionId={transaction.transactionId}
                documentId={printConfig.documentId}
                documentLabel={printConfig.label}
              />
            )}
            {cancelLabel && (
              <Button
                type="button"
                variant="destructive"
                className="w-full h-11 gap-1.5"
                disabled={cancelMutation.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                <Ban className="w-4 h-4" />
                {cancelMutation.isPending ? 'Working…' : cancelLabel}
              </Button>
            )}
          </div>
        )}
      </div>

      {cancelLabel && (
        <ConfirmDialog
          isOpen={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={cancelLabel}
          description={`This will permanently void ${transaction.documentNo ?? `#${transaction.transactionId}`} in OrnaVerse. This cannot be undone.`}
          confirmLabel={cancelLabel}
          onConfirm={() => cancelMutation.mutate(transaction.transactionId)}
        />
      )}
    </>
  );
}

function TransactionRow({ item, onSelect }) {
  return (
    <button onClick={() => onSelect(item)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted/30 active:bg-muted/50 transition-colors text-left">
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.documentNo ?? `#${item.transactionId}`}</p>
        <p className="text-xs text-muted-foreground truncate">{item.customerName ?? 'Unknown customer'}</p>
        <p className="text-xs text-muted-foreground">{formatDate(item.documentDate)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex flex-col items-end gap-1">
          <p className="text-sm font-semibold text-foreground tabular-nums">{formatINR(item.amount)}</p>
          {item.status && <PaymentStatusBadge status={item.status} size="sm" />}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );
}


function TransactionList({ hook: useHook, emptyMessage, type }) {
  const [skip, setSkip]         = useState(0);
  const [selected, setSelected] = useState(null);
  const [showOnlyCustomer, setShowOnlyCustomer] = useState(false);
  const customerId   = useSelector(selectCartCustomerId);
  const customerName = useSelector(selectCartCustomerName);
  const isAttached   = !!customerId;

  const { items: allItems, totalCount, take, isLoading, isFetching, isError, refetch } = useHook({ skip });

  const items = showOnlyCustomer && isAttached
    ? allItems.filter((item) => item.customerId === customerId)
    : allItems;

  const totalPages  = Math.max(1, Math.ceil(totalCount / take));
  const currentPage = Math.floor(skip / take) + 1;

  const handlePrev = useCallback(() => setSkip((s) => Math.max(0, s - take)), [take]);
  const handleNext = useCallback(() => setSkip((s) => s + take), [take]);

  if (isLoading) return <ListRowsSkeleton rows={5} lines={3} />;

  if (isError) return (
    <div className="flex flex-col items-center gap-3 py-12">
      <p className="text-sm text-muted-foreground">Failed to load transactions.</p>
      <button onClick={refetch} className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );

  return (
    <>
      {isAttached && (
        <label className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4">
          <span className="text-sm font-medium text-foreground truncate">
            Show only {customerName ?? 'this customer'}&apos;s transactions
          </span>
          <Switch checked={showOnlyCustomer} onCheckedChange={setShowOnlyCustomer} />
        </label>
      )}

      {!items.length ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          {showOnlyCustomer && isAttached && allItems.length > 0
            ? `No transactions for ${customerName ?? 'this customer'} on this page.`
            : emptyMessage}
        </p>
      ) : (
        <>
          {isFetching && !isLoading && (
            <div className="flex justify-center py-2">
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
            </div>
          )}
          <div className="rounded-xl border border-border overflow-hidden">
            {items.map((item) => (
              <TransactionRow key={item.transactionId ?? item.documentNo} item={item} onSelect={setSelected} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <button onClick={handlePrev} disabled={skip === 0} className="text-xs font-medium text-primary disabled:text-muted-foreground disabled:cursor-not-allowed">← Previous</button>
              <p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</p>
              <button onClick={handleNext} disabled={currentPage >= totalPages} className="text-xs font-medium text-primary disabled:text-muted-foreground disabled:cursor-not-allowed">Next →</button>
            </div>
          )}
        </>
      )}
      {selected && <TransactionDetailSheet transaction={selected} type={type} onClose={() => setSelected(null)} />}
    </>
  );
}

const TABS = [
  { id: 'returns',      label: 'Returns',      icon: RotateCcw,      hook: useReturns,      emptyMessage: 'No return transactions found.',      NewForm: (props) => <SoldItemFlowForm flow="return" {...props} /> },
  { id: 'refunds',      label: 'Refunds',      icon: CreditCard,     hook: useRefunds,      emptyMessage: 'No refund transactions found.',      NewForm: (props) => <RefundNewForm {...props} /> },
  { id: 'credit-notes', label: 'Credit Notes', icon: FileText,       hook: useCreditNotes,  emptyMessage: 'No credit notes found.',             NewForm: (props) => <CreditNoteNewForm {...props} /> },
  { id: 'exchange',     label: 'Exchange',     icon: ArrowLeftRight, hook: useExchanges,    emptyMessage: 'No exchange transactions found.',    NewForm: (props) => <SoldItemFlowForm flow="exchange" {...props} /> },
  { id: 'buyback',      label: 'Buyback',      icon: ShoppingBag,    hook: useBuybacks,     emptyMessage: 'No buyback transactions found.',     NewForm: (props) => <SoldItemFlowForm flow="buyback" {...props} /> },
  { id: 'urd',          label: 'URD Purchase', icon: Coins,          hook: useURDPurchases, emptyMessage: 'No URD purchase transactions found.',NewForm: (props) => <MetalLineItemForm type="urd" {...props} /> },
];

function TransactionsScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = TABS.find((t) => t.id === searchParams.get('tab'))?.id ?? TABS[0].id;
  const initialView = searchParams.get('new') === '1' ? 'new' : 'list';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [view, setView]           = useState(initialView); // 'list' | 'new'
  const storeId = useSelector((state) => state.store.activeStoreId);

  const activeTabConfig = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const handleTabChange = (id) => {
    setActiveTab(id);
    setView('list');
    router.replace(`/transactions?tab=${id}`, { scroll: false });
  };

  return (
    <div className="p-4 pb-8 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">Returns, refunds, and post-sale activity</p>
        <div className="flex items-center gap-2 shrink-0">
          {storeId && activeTab === 'returns' && view === 'list' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => router.push('/transfers')}
            >
              <Repeat className="w-3.5 h-3.5" /> Interstore Return
            </Button>
          )}
          {storeId && (
            <Button
              size="sm"
              variant={view === 'new' ? 'outline' : 'default'}
              className="gap-1.5"
              onClick={() => setView((v) => (v === 'new' ? 'list' : 'new'))}
            >
              {view === 'new' ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><Plus className="w-3.5 h-3.5" /> New</>}
            </Button>
          )}
        </div>
      </div>

      {!storeId && (
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to view transactions.</p>
        </div>
      )}

      {storeId && (
        <>
          <PillTabs
            tabs={TABS}
            value={activeTab}
            onChange={handleTabChange}
            getKey={(t) => t.id}
            variant="chip"
            scrollable
            className="-mx-4 px-4"
          />

          {view === 'list' && (
            <TransactionList key={activeTab} hook={activeTabConfig.hook} emptyMessage={activeTabConfig.emptyMessage} type={activeTab} />
          )}

          {view === 'new' && (
            <div key={`new-${activeTab}`} className="rounded-xl border border-border bg-card p-4">
              <activeTabConfig.NewForm onDone={() => setView('list')} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <TransactionsScreen />
    </Suspense>
  );
}
