'use client';

// This page is the only place transactions are created or viewed — the
// previously-separate /returns, /exchange, /buyback, /urd-purchase pages
// (and their dedicated services/hooks) were deleted; everything here runs
// on transactionService.js via useTransactionLists.js + useTransactionMutations.js.
//
// SCHEMA FACTS:
//   - All transaction rows share: transaction_id, document_no,
//     document_date, party_id, party_name, net_amount
//   - normalizeTransaction (from useTransactionLists) maps these to:
//     transactionId, documentNo, documentDate, customerId,
//     customerName, amount
//   - "NA" string values already nulled out by normalizer
//   - company_id (NOT current_company_id) is the field OrnaVerse expects
//     for POS transaction List/Create calls — current_company_id is the
//     Inventory/ProductCatalog-specific convention, confirmed fixed in
//     transactionService.js as part of this consolidation.
//
// RESOLVED 2026-07-16: RefundDetailsRow's ledger_id is now sourced from the
// selected payment mode's own ledger_id (confirmed real field via
// PaymentReceiptMode/List and Refund/List) — see RefundNewForm below.
//
// HEADER FIELDS (2026-07-28) — the "AccessDenied" framing below is STALE.
// Confirmed live 2026-07-28 that Return/Create actually returns the same
// generic 500 Order/Invoice/Create had before their header-field fix, not
// AccessDenied — see [[pos-cash-checkout-status]] memory. Applied the same
// fix here (financial_year_id/ledger_id/document_id/document_no/party
// identity/aggregate weight/receipt+balance — see
// transactionHeaderService.buildTransactionHeaderFields, useOrderHeaderConfig)
// across all 6 flows below, UNVERIFIED LIVE per the user's explicit
// direction to code this without a live round-trip per flow (unlike Order,
// which went through 3 rounds of live retest-and-discover). Treat a
// continued 500 on any of these as "run the same live-capture diagnostic
// used for Order" rather than assuming AccessDenied again.

import { Suspense, useState, useCallback } from 'react';
import { useSelector }                     from 'react-redux';
import { useRouter, useSearchParams }      from 'next/navigation';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver }                     from '@hookform/resolvers/zod';
import { z }                               from 'zod';
import { toast }                           from 'react-toastify';
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
import { usePaymentModes }                from '@/hooks/checkout/usePaymentModes';
import { useURDMasterItem }                from '@/hooks/transactions/useURDMasterItem';
import { useSoldItems }                    from '@/hooks/transactions/useSoldItems';
import { useCustomerCredits }              from '@/hooks/transactions/useCustomerCredits';
import { useOrderHeaderConfig }            from '@/hooks/checkout/useOrderHeaderConfig';
import { buildTransactionHeaderFields }    from '@/services/transactionHeaderService';
import { calculateReturnItems, calculateBuybackItems, calculateExchangeItems } from '@/services/returnItemsService';
import EmptyState                          from '@/components/shared/EmptyState';
import ErrorState                          from '@/components/shared/ErrorState';
import InlineLoader                        from '@/components/shared/InlineLoader';
import ItemSearchPicker                    from '@/components/features/transactions/ItemSearchPicker';
import { selectActiveStoreId }            from '@/store/slices/storeSlice';
import { selectCartCustomerId, selectCartCustomerName, selectCartCustomerMobile } from '@/store/slices/cartSlice';
import APP_CONFIG                         from '@/constants/appConfig';
import { todayDateString, formatDatePadded } from '@/lib/dateUtils';
import { formatAmountOrDash } from '@/lib/priceUtils';

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

// De-duplicated 2026-09-08 — identical copies existed in estimation/page.jsx
// and repair/page.jsx; see lib/priceUtils.js's formatAmountOrDash and
// lib/dateUtils.js's formatDatePadded for the shared versions.
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

// REBUILT 2026-07-30 to match how a return actually works.
//
// The old form asked staff to type item_id / pieces / rate / net_amount by
// hand and referenced the original invoice by typed transaction_id. That
// could never succeed: Return/Create requires the ~186-field computed line
// item from Helpers/SetReturnItems, and hand-built line items produced a
// long run of opaque 500s. Confirmed by capturing OrnaVerse's own UAT
// Returns journey — see returnItemsService.js.
//
// Real flow (theirs, now ours): pick from what the customer actually BOUGHT
// (POS/InvoiceItems/List) → price it for return (SetReturnItems) → Create →
// Post. This is also better UX: no typing item IDs off a printed bill, and
// the customer can only return things they genuinely purchased.
// Return and Buy Back are the SAME journey with a different pricing helper
// and document type — which is exactly how OrnaVerse models it too (their
// Returns screen has Return / Exchange / Buy Back as three modes sharing one
// "Sold Item" picker). Configured here rather than duplicated.
const SOLD_ITEM_FLOWS = {
  return: {
    documentTypeId: APP_CONFIG.DOCUMENT_TYPES.RETURN,
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
    // A return reverses a sale, so backdating stays closed.
    allowBackdatedEntry: false,
  },
  buyback: {
    documentTypeId: APP_CONFIG.DOCUMENT_TYPES.BUYBACK,
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
    // Their captured BuyBack/Create sends allow_backdated_entry:true —
    // a buyback can legitimately be dated to when the piece came in.
    allowBackdatedEntry: true,
  },
  // Exchange is ONE-SIDED at the document level — confirmed live
  // 2026-07-30. It does NOT carry a replacement item; completing it just
  // raises the customer's credit (their balance rose by exactly the
  // exchange value), and the replacement is then bought as a normal sale
  // paid with that credit. Structurally identical to Return/Buy Back, so
  // it belongs here rather than in the metal-weights form.
  exchange: {
    documentTypeId: APP_CONFIG.DOCUMENT_TYPES.EXCHANGE,
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
    // NOTE: unlike Return/Buy Back, Exchange's document type has
    // auto_posting:FALSE — so the explicit Post step genuinely runs here.
    // That's handled generically off headerConfig.autoPosting.
    helperText: 'This raises store credit for the customer. Ring up the replacement piece as a normal sale and pay with that credit.',
  },
};

const soldItemFlowSchema = z.object({
  document_date: z.string().min(1, 'Required'),
  selected_keys: z.array(z.string()).min(1, 'Select at least one item'),
});

// A sold-item row has no single stable id, so identify it the way the
// document itself does: original document + line number.
const soldItemKey = (row) => `${row.document_no ?? ''}#${row.item_line_no ?? ''}`;

function SoldItemFlowForm({ flow, onDone }) {
  // The three flows are switchable in-place, mirroring OrnaVerse's own POS
  // (their Returns screen offers Return / Exchange / Buy Back as modes over
  // one "Sold Item" picker). The tab you arrived from just sets the default.
  const [mode, setMode] = useState(flow);
  const config         = SOLD_ITEM_FLOWS[mode];
  const storeId        = useSelector(selectActiveStoreId);
  const customerId     = useSelector(selectCartCustomerId);
  const customerName   = useSelector(selectCartCustomerName);
  const headerConfig   = useOrderHeaderConfig(config.documentTypeId);
  const { soldItems, isLoading: soldLoading, isError: soldError, refetch: refetchSold } =
    useSoldItems(customerId);

  // Hooks can't be called conditionally, so instantiate all three pairs and
  // pick the active one by mode.
  const createReturnDoc   = useCreateReturn({ onSuccess: () => {} });
  const postReturnDoc     = usePostReturn({ onSuccess: () => onDone() });
  const createBuybackDoc  = useCreateBuyback({ onSuccess: () => {} });
  const postBuybackDoc    = usePostBuyback({ onSuccess: () => onDone() });
  const createExchangeDoc = useCreateExchange({ onSuccess: () => {} });
  const postExchangeDoc   = usePostExchange({ onSuccess: () => onDone() });
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
    if (!headerConfig.isReady) {
      // isError means the underlying queries already exhausted their
      // retries and are stuck — "try again in a moment" alone would never
      // resolve on its own from there, so kick off a fresh attempt now
      // rather than leave the operator with no path but a hard refresh.
      // isConfigMissing is a THIRD, distinct case (confirmed live 2026-08-14
      // for Credit Note specifically — zero DocumentNumbering rows exist
      // for it on any store) — no amount of retrying will ever fix that.
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
      // Pass the sold-item rows through UNMODIFIED — the pricing helper needs
      // the full nested shape (incl. the ref_* linkage to the original sale).
      const line_items = await config.priceItems({
        items: selectedRows,
        documentDate: new Date(data.document_date),
      });
      setIsPricing(false);
      if (!line_items.length) throw new Error('Could not price the selected items.');

      // CONFIRMED LIVE 2026-09-22: SetExchangeItems/SetBuybackItems (unlike
      // SetReturnItems) come back with `net_amount`/`sub_total` at 0 — the
      // real priced value only lands in `base_net_amount`/`base_sub_total`.
      // A real Exchange/BuyBack created before this fix would silently
      // record zero credit for a customer's real item (verified: a live
      // Exchange and BuyBack both created successfully with net_amount:0/
      // balance_amount:0 against their real ~₹86,731/~₹45,827 items).
      // Falling back to the base_* field is safe for every flow — Return's
      // own net_amount already equals its base_net_amount, so this changes
      // nothing there, only fixes the two that were actually broken.
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
          receiptAmount: Math.round(netRaw),
          documentDate: data.document_date,
          forReturn: true,
          allowBackdatedEntry: config.allowBackdatedEntry,
        }),
        line_items,
        remark: '',
        // No receipt_details and no header-level ref_transaction_id — neither
        // a Return nor a Buy Back carries them (the per-line ref_* fields
        // already tie back to the original sale). Confirmed against their
        // captured payloads; sending either is what previously 500'd.
      });
      const transactionId = createRes?.EntityId;
      if (!transactionId) throw new Error('Creation failed — no EntityId returned.');
      // Only Post when the document type isn't already auto-posting.
      // Confirmed live 2026-07-30: these document types have
      // auto_posting:true, so Create ALSO posts (posting_date/posted_by come
      // back populated) and a follow-up Post fails with
      // {"Code":"AlreadyPosted","Message":"[pos].[return] is already posted!"}.
      if (!headerConfig.autoPosting) {
        await postDoc.mutateAsync(transactionId);
      }
      reset();
    } catch (err) {
      setIsPricing(false);
      toast.error(getErrorMessage(err));
    }
  };

  const total = selectedRows.reduce((s, r) => s + (r.net_amount ?? 0), 0);

  const isSubmitting = isPricing || createDoc.isPending || postDoc.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />

      {/* Return / Exchange / Buy Back all start from the same sold-item
          picker and differ only in document type + pricing helper, so they're
          modes here rather than three separate journeys — same as OrnaVerse's
          own POS. Locked once items are chosen: the three produce different
          documents, so a half-built selection can't carry across. */}
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

      <FormField label="Date" required error={errors.document_date}>
        <Input type="date" max={todayDateString()} {...register('document_date')} className="h-11" />
      </FormField>

      <div className="flex flex-col gap-2">
        <Label>
          {config.itemsLabel} <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Pick from what this customer has purchased — tap to select.
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
          <EmptyState
            className="border-0 py-6"
            icon={RotateCcw}
            title={config.emptyTitle}
            description={config.emptyHint}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {soldItems.map((row) => {
              const key = soldItemKey(row);
              const isSelected = selectedKeys.includes(key);
              return (
                <button
                  type="button"
                  key={key}
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
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatINR(row.net_amount)}
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                  </div>
                </button>
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

      {/* No refund/payout method picker here on purpose. Neither a Return
          nor a Buy Back carries receipt_details (confirmed against
          OrnaVerse's own payloads — sending them is rejected); both raise
          the customer's credit instead. Settling that credit in cash is a
          separate Refund / Credit Note document, so asking for a mode here
          would collect a value we'd silently discard. */}

      <Button
        type="submit"
        disabled={isSubmitting || !customerId || selectedRows.length === 0}
        className="h-12 mt-1"
      >
        {isSubmitting ? config.busyLabel : config.submitLabel}
      </Button>
    </form>
  );
}

// All three share the same weight/purity/rate shape, differing in how the
// line item's `item_id` is resolved and whether a receipt (payout) section
// is shown. Configured per type rather than duplicated three times.
//
// REBUILT 2026-07-16 — the original version invented `metal_type_id` +
// freeform `item_name` fields that don't match OrnaVerse's real schema.
// Confirmed via real Exchange/Buyback/URD Retrieve data: line items
// reference a genuine master `item_id` (Exchange/Buyback: the actual piece
// the customer is handing in, found by SKU search — see ItemSearchPicker;
// URD: a fixed generic "URD GOLD" master item, see useURDMasterItem and
// appConfig.js URD_MASTER_ITEMS for why it can't be searched). weight/
// purity/item_rate are pre-filled from the resolved item but stay editable,
// since a buyback/exchange appraisal rate can legitimately differ from the
// item's original sale rate.

// Only URD Purchase still belongs here. Returns, Buy Back and Exchange all
// moved to SoldItemFlowForm on 2026-07-30: each is the store taking back a
// piece it previously SOLD, so each needs the sold-item picker plus its own
// Helpers/Set*Items pricing call — not hand-typed metal weights. That
// mirrors OrnaVerse's own POS, where all three are modes of one Returns
// screen sharing a single "Sold Item" picker.
//
// URD Purchase is genuinely different: old gold walks in off the street and
// was never sold by us, so there's no sold-item record to price against and
// hand-entered weight/purity/rate is the correct model.
const METAL_TYPE_CONFIGS = {
  urd: {
    amountField: 'amount',
    pickerMode:  'fixed',
    createHook:  useCreateURDPurchase,
    postHook:    usePostURDPurchase,
    submitLabel: 'Submit URD Purchase',
    processingLabel: 'Processing Purchase…',
    documentTypeId: APP_CONFIG.DOCUMENT_TYPES.URD_PURCHASE,
  },
};

function buildMetalLineItemSchema(config) {
  const shape = {
    weight:     z.coerce.number().min(0.001, 'Required'),
    purity:     z.coerce.number().min(0, 'Required'),
    item_rate:  z.coerce.number().min(0, 'Required'),
    [config.amountField]: z.coerce.number().min(0, 'Required'),
  };
  if (config.pickerMode === 'search') {
    shape.item = z.object({ item_id: z.number() }).nullable()
      .refine((v) => v !== null, { message: 'Select an item' });
  }
  return z.object(shape);
}

// No payout_mode_id here on purpose — see the note at the payout section in
// the form body. A URD Purchase carries no receipt_details, so a payout mode
// collected here could never be submitted.
function buildMetalFormSchema(config) {
  return z.object({
    document_date: z.string().min(1, 'Required'),
    line_items:    z.array(buildMetalLineItemSchema(config)).min(1, 'Add at least one item'),
  });
}

function emptyMetalLineItem(config) {
  const item = { weight: '', purity: '', item_rate: '', [config.amountField]: '' };
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
  const post   = config.postHook({ onSuccess: () => onDone() });

  const schema = buildMetalFormSchema(config);

  const { register, handleSubmit, control, watch, setValue, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      document_date: todayDateString(),
      line_items: [emptyMetalLineItem(config)],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' });
  const watchedItems = watch('line_items');
  const total = watchedItems.reduce((sum, i) => sum + (Number(i[config.amountField]) || 0), 0);

  // Pre-fill weight/purity/item_rate from the picked item — still editable
  // afterwards, since the appraised rate can differ from the item's own rate.
  const handleItemSelect = (index, item) => {
    setValue(`line_items.${index}.item`, item);
    setValue(`line_items.${index}.weight`, item.weight ?? item.net_weight ?? '');
    setValue(`line_items.${index}.purity`, item.purity ?? '');
    setValue(`line_items.${index}.item_rate`, item.item_rate ?? '');
  };

  const onSubmit = async (data) => {
    if (!customerId) return toast.error('Assign a customer to the session before submitting.');
    if (config.pickerMode === 'fixed' && !urdItem) {
      return toast.error('URD Gold master item is still loading — try again in a moment.');
    }
    if (!headerConfig.isReady) {
      // isError means the underlying queries already exhausted their
      // retries and are stuck — "try again in a moment" alone would never
      // resolve on its own from there, so kick off a fresh attempt now
      // rather than leave the operator with no path but a hard refresh.
      // isConfigMissing is a THIRD, distinct case (confirmed live 2026-08-14
      // for Credit Note specifically — zero DocumentNumbering rows exist
      // for it on any store) — no amount of retrying will ever fix that.
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
      // FIXED 2026-09-17 — full line_items shape below is reverse-engineered
      // from a REAL, successfully posted URD Purchase on LIVE (transaction_id
      // 109, the same fixed "URD GOLD" item_id 46875 this form always uses),
      // read via a read-only Retrieve (no document created/changed to get
      // it), then verified end-to-end on UAT (Create → auto-posted →
      // Retrieve → Cancel, all succeeded — transaction_id 224). The
      // PREVIOUS version of this code sent only item_id/item_code/item_name/
      // weight/purity/item_rate/amount — nowhere near what URDPurchase's
      // real Create handler expects; it needs the item's full classification
      // (karat/metal/type/tax template/etc.), the same way a BOM component
      // row does elsewhere in this app, not a bare transaction line.
      //
      // Two real, counter-intuitive findings from that reference record:
      //   - `item_cost` is genuinely 0 on a real row — the actual amount
      //     lives in sub_total/net_amount/taxable_amount/base_* instead
      //     (unlike every OTHER document type here, where the analogous
      //     field carries the real amount).
      //   - karat_id is 1022 ("OldGold") — a distinct classification from
      //     whatever karat the same item_id resolves to elsewhere. This is
      //     the piece that was actually missing before (not the amount
      //     field naming) — supplying `taxable_amount` without also
      //     supplying this real classification is what crashed Create.
      const line_items = data.line_items.map((i) => {
        const resolvedItem = config.pickerMode === 'fixed' ? urdItem : i.item;
        const amount = Number(i[config.amountField]);
        const weight = Number(i.weight);
        const purity = Number(i.purity);
        return {
          item_id:   resolvedItem.item_id,
          item_code: resolvedItem.item_code,
          item_name: resolvedItem.item_name,
          party_id:   customerId,
          company_id: storeId,
          item_attribute_id: resolvedItem.item_attribute_id,
          hsn:               resolvedItem.hsn,
          tax_template_id:   resolvedItem.tax_template_id,
          item_group_id:     resolvedItem.item_group_id,
          base_item_id:      resolvedItem.base_item_id,
          // Confirmed on the real reference record, not present (or not
          // reliably present) on every Items/Retrieve shape — real, fixed
          // values for this tenant's "URD GOLD" master item specifically.
          karat_id:     resolvedItem.karat_id     ?? 1022,
          metal_id:     resolvedItem.metal_id     ?? 0,
          type_id:      resolvedItem.type_id      ?? 13,
          sub_type_id:  resolvedItem.sub_type_id  ?? 0,
          base_item:    resolvedItem.base_item    ?? 'METAL',
          uom_id:       resolvedItem.uom_id       ?? 7,
          uoc_id:       resolvedItem.uoc_id       ?? 4,
          metal_color_id:  resolvedItem.metal_color_id  ?? 0,
          stone_color_id:  resolvedItem.stone_color_id  ?? 0,
          quality_id:      resolvedItem.quality_id      ?? 0,
          shape_id:        resolvedItem.shape_id        ?? 0,
          stone_size_id:   resolvedItem.stone_size_id   ?? 0,
          sieve_id:        resolvedItem.sieve_id        ?? 0,
          group_sieve_id:  resolvedItem.group_sieve_id  ?? 0,
          sales_costing_id:    resolvedItem.sales_costing_id    ?? 9,
          purchase_costing_id: resolvedItem.purchase_costing_id ?? 9,

          weight, net_weight: weight,
          purity,
          pure_weight: +(weight * purity).toFixed(3),
          item_rate: Number(i.item_rate),
          item_labour: 0,

          // The real amount — item_cost genuinely stays 0 (see header note above).
          item_cost: 0,
          sub_total: amount,
          net_amount: amount,
          base_sub_total: amount,
          base_net_amount: amount,
          taxable_amount: amount,
          base_unit_cost: 0,
          mf: 0,
          mf_amount: 0,
          tax_amount: 0,
          base_tax_amount: 0,
          metal_amount: 0, diamond_amount: 0, color_stone_amount: 0, stone_amount: 0, other_amount: 0,
          diamond_pieces: 0, diamond_weight: 0, stone_pieces: 0, stone_weight: 0,
          other_pieces: 0, other_weight: 0, color_stone_pieces: 0, color_stone_weight: 0,

          location_id: 1, // "Finish Goods" — matches every real URD Purchase record on this tenant.
          is_urd: true,
          is_finished: false,
          is_acknowledged: true,
          is_tax_applicable: true, // line-level; the HEADER's own is_tax_applicable stays false (see below).
          is_gift: false,
          is_allocated: false,
          stone_status_id: 1,
          hallmark_state_id: 1,
          bag_status_id: 0,
          group_id: 0,
          item_line_no: 0,
          pieces: 0,
          discount: 0,
          discount_percent: 0,
          pointer_weight: 0,
          parts: 0,
          export_pieces: 0,
          stone_rate: 0,
          other_rate: 0,
          ref_transaction_item_id: 0, ref_document_id: 0, ref_transaction_id: 0,
          bag_no: '', sku: '', lot_no: '', certificate_no: '', ref_no: '', huid: '',
          image: '', narration: '', special_instructions: '', user_description: '',
          type_of_document: 1,
        };
      });
      const totalWeight = line_items.reduce((s, i) => s + i.weight, 0);

      const { mobile: _unusedMobile, receipt_amount: _unusedReceiptAmount, ...headerFields } = buildTransactionHeaderFields({
        subTotal: total, taxableAmount: total, taxAmount: 0, netAmount: total,
        pieces: line_items.length, weight: totalWeight, netWeight: totalWeight,
        customerId, customerName, customerMobile,
        activeStoreId: storeId,
        headerConfig,
        documentTypeId: config.documentTypeId,
        receiptAmount: total,
        documentDate: data.document_date,
      });
      // FIXED 2026-09-17, confirmed live on UAT: URDPurchaseRow has no
      // `mobile` field (only `phone_code`, never populated by this Create
      // call) and no `receipt_amount` field (only `balance_amount`) —
      // buildTransactionHeaderFields's generic branch sends both
      // unconditionally since Order/Invoice genuinely need them, but
      // either one 500s URDPurchase/Create specifically. Stripped here
      // rather than in the shared helper, since Order/Invoice (and likely
      // Credit Note, once its own DocumentNumbering gets configured on
      // this tenant — untestable until then) still need them.
      const payload = {
        ...headerFields,
        line_items,
        // NO receipt_details. Confirmed live on UAT 2026-07-29 that the field
        // exists ONLY on Order/Invoice; on URDPurchase every real record has
        // it `undefined`, and sending it 500s the Create.
      };
      const createRes = await create.mutateAsync(payload);
      const transactionId = createRes?.EntityId;
      if (!transactionId) throw new Error('Creation failed — no EntityId returned.');
      // Only Post when the document type isn't already auto-posting — same
      // guard as Return/Exchange/Buyback/Credit Note above. This was the
      // one flow that skipped it and called Post unconditionally.
      // CONFIRMED live 2026-08-14 via DocumentNumbering/List (document_id
      // 104): auto_posting:true on every company row for this tenant — so
      // every successful URD Purchase was hitting AlreadyPosted and
      // showing the cashier a failure toast for a transaction that had, in
      // fact, already gone through.
      if (!headerConfig.autoPosting) {
        await post.mutateAsync(transactionId);
      }
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const isSubmitting = create.isPending || post.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />

      <FormField label="Date" required error={errors.document_date}>
        <Input type="date" max={todayDateString()} {...register('document_date')} className="h-11" />
      </FormField>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Line Items <span className="text-destructive">*</span></Label>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs"
            onClick={() => append(emptyMetalLineItem(config))}>
            <Plus size={12} /> Add Item
          </Button>
        </div>
        {fields.map((field, index) => (
          <div key={field.id} className="rounded-xl border border-border bg-muted p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
              {fields.length > 1 && (
                <RemoveLineItemButton onClick={() => remove(index)} />
              )}
            </div>

            {config.pickerMode === 'search' && (
              <FormField label="Item" required error={errors.line_items?.[index]?.item}>
                <Controller
                  name={`line_items.${index}.item`}
                  control={control}
                  render={({ field: itemField }) => (
                    <ItemSearchPicker
                      selectedItem={itemField.value}
                      onSelect={(item) => handleItemSelect(index, item)}
                      onClear={() => setValue(`line_items.${index}.item`, null)}
                    />
                  )}
                />
              </FormField>
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
              <FormField label="Rate (₹/g)" required error={errors.line_items?.[index]?.item_rate}>
                <Input type="number" inputMode="decimal" {...register(`line_items.${index}.item_rate`)} className="h-9 text-sm" />
              </FormField>
              <FormField label={config.amountField === 'exchange_value' ? 'Exchange Value (₹)' : 'Amount (₹)'} required error={errors.line_items?.[index]?.[config.amountField]}>
                <Input type="number" inputMode="decimal" {...register(`line_items.${index}.${config.amountField}`)} className="h-9 text-sm" />
              </FormField>
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

      {/* No "Payout Method" picker. A URD Purchase records the old gold
          coming in and raises what the store owes the customer; it carries
          no receipt_details (Order/Invoice only — confirmed live), so a mode
          chosen here could never be submitted. Paying the customer is a
          separate Refund, which settles this against a real payout mode. */}

      <Button type="submit" disabled={isSubmitting || !customerId} className="h-12 mt-1">
        {isSubmitting ? config.processingLabel : config.submitLabel}
      </Button>
    </form>
  );
}

// Issued as a lump-sum store credit rather than an itemised return — matches
// CreditNoteRow, which supports a header net_amount without requiring
// line_items to be populated for a simple issuance.

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
  // document_id 123 ("CRN") — CONFIRMED 2026-08-01 off OrnaVerse's own New
  // CreditNote form. This previously reused RETURN's 55, on the assumption
  // the two shared a type because their List rows looked alike. They don't.
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
      // isError means the underlying queries already exhausted their
      // retries and are stuck — "try again in a moment" alone would never
      // resolve on its own from there, so kick off a fresh attempt now
      // rather than leave the operator with no path but a hard refresh.
      // isConfigMissing is a THIRD, distinct case (confirmed live 2026-08-14
      // for Credit Note specifically — zero DocumentNumbering rows exist
      // for it on any store) — no amount of retrying will ever fix that.
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
          documentDate: data.document_date,
        }),
        ref_transaction_id: data.ref_transaction_id ? Number(data.ref_transaction_id) : undefined,
        narration: data.narration || undefined,
      });
      const transactionId = createRes?.EntityId;
      if (!transactionId) throw new Error('Credit note creation failed — no EntityId returned.');
      // Document 123 has auto_posting TRUE, so Create already posted it —
      // posting again returns AlreadyPosted. Only post when the store's own
      // config says the document doesn't self-post.
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

      <FormField label="Date" required error={errors.document_date}>
        <Input type="date" max={todayDateString()} {...register('document_date')} className="h-11" />
      </FormField>

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

// REBUILT 2026-07-31 after capturing the ERP's own Refund dialog.
//
// A refund PAYS OUT credit that a Return / Exchange / Buy Back already
// raised — it is not a free-standing "give the customer money" document.
// The old form asked for a bare amount + mode and fired THREE calls
// (create → RefundDetails/Create → RefundReceipts/Create) with no link to
// any credit at all, so it produced refunds that settled nothing.
//
// Real flow: pick which outstanding credit(s) to settle, say how the money
// leaves, and Create ONCE with details[] + receipts[] nested. The receipt
// MUST carry the credit's transaction_id — that FK is the settlement; two
// hand-built refunds saved cleanly without it and left the credit open.
// See refundService.js.
const refundSchema = z.object({
  document_date: z.string().min(1, 'Required'),
  mode_id:       z.coerce.number().min(1, 'Select how the money is paid out'),
  credit_keys:   z.array(z.number()).min(1, 'Select at least one credit to refund'),
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
    defaultValues: { document_date: todayDateString(), mode_id: '', credit_keys: [] },
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
      // isError means the underlying queries already exhausted their
      // retries and are stuck — "try again in a moment" alone would never
      // resolve on its own from there, so kick off a fresh attempt now
      // rather than leave the operator with no path but a hard refresh.
      // isConfigMissing is a THIRD, distinct case (confirmed live 2026-08-14
      // for Credit Note specifically — zero DocumentNumbering rows exist
      // for it on any store) — no amount of retrying will ever fix that.
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
      await create.mutateAsync({
        partyId: customerId,
        partyName: customerName,
        activeStoreId: storeId,
        financialYearId: headerConfig.financialYearId,
        documentDate: data.document_date,
        // settle each selected credit in full — the API supports partial
        // (allow_partial:true) but there's no per-credit amount input yet.
        credits: selectedCredits.map((credit) => ({ credit, amount: credit.amount })),
        payout: {
          modeId:   Number(data.mode_id),
          ledgerId: mode?.ledgerId,
          amount:   total,
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

      <FormField label="Date" required error={errors.document_date}>
        <Input type="date" max={todayDateString()} {...register('document_date')} className="h-11" />
      </FormField>

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
          <div className="flex flex-col gap-2">
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
        <PaymentModeSelect control={control} name="mode_id" paymentModes={paymentModes} modesLoading={modesLoading} />
      </FormField>

      <Button
        type="submit"
        disabled={isSubmitting || !customerId || selectedCredits.length === 0}
        className="h-12 mt-1"
      >
        {isSubmitting ? 'Processing Refund…' : 'Submit Refund'}
      </Button>

      {/* Confirmed live 2026-08-14 (see refundService.js's stampRefDocumentNo
          header for the full repro): the payout is real and this does file
          a refund record, but the underlying credit is NOT actually marked
          settled afterward — its balance stays exactly where it was. Say so
          plainly; this is a real-money gap, not a cosmetic one. */}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground -mt-2">
        <AlertCircle size={13} className="shrink-0 mt-0.5 text-status-made-order" aria-hidden="true" />
        The selected credit(s) may still show as outstanding after this — OrnaVerse
        doesn&apos;t reliably mark them settled yet. Track paid-out refunds manually
        until that&apos;s confirmed fixed.
      </p>
    </form>
  );
}

// ADDED 2026-09-16 — Cancel/Delete was fully implemented at the mutation-hook
// level for all 6 transaction types (useCancelReturn/useDeleteRefund/
// useCancelCreditNote/useCancelExchange/useCancelBuyback/useCancelURDPurchase
// in useTransactionMutations.js) but had ZERO call sites anywhere — this
// sheet was view-only, so a created document could never be voided from
// this app once it existed. Wired here, generically, keyed by the active
// tab's `type` so one detail sheet serves all 6 without six near-duplicate
// components.
//
// CORRECTED 2026-09-17 against a real live Services/POS/*/List capture on
// every one of these 6 types (plus Repair In/Out/Invoice and Invoice
// itself): a real `document_status` field DOES exist on every row (a
// previous comment here claimed otherwise — that was wrong, not just
// unconfirmed). It's now surfaced in this sheet's own headerRows below.
// Its enum meaning per type is still NOT confirmed (only ever observed as
// 1 on posted-looking rows and 0 on one real RepairIn row that nonetheless
// already had posting_date/posted_by set, so a simple "0 = draft, 1 =
// posted" reading doesn't hold cleanly across types) — shown as a neutral
// raw number, same convention SchemeCard already uses for an unconfirmed
// enum, rather than guessing a label. The action button is still always
// shown rather than guessed-hidden for this same reason; OrnaVerse's own
// API remains the source of truth for rejecting a document that's already
// in a state that can't be cancelled (surfaced via the mutation's existing
// onError toast, same as every other action in this file).
const CANCEL_LABEL_BY_TYPE = {
  returns:        'Cancel Return',
  refunds:        'Delete Refund',
  'credit-notes': 'Cancel Credit Note',
  exchange:       'Cancel Exchange',
  buyback:        'Cancel Buyback',
  urd:            'Cancel URD Purchase',
};

function TransactionDetailSheet({ transaction, type, onClose }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Every type's mutation hook is called unconditionally (Rules of Hooks —
  // this component can't call just one based on `type`), then the right
  // one is picked below. Each hook call is cheap: useMutation does nothing
  // until .mutate() actually runs.
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

  const cancelLabel = CANCEL_LABEL_BY_TYPE[type];
  const cancelMutation = mutationByType[type];

  const headerRows = [
    { icon: Hash,        label: 'Document No', value: transaction.documentNo ?? `#${transaction.transactionId}` },
    { icon: Calendar,    label: 'Date',        value: formatDate(transaction.documentDate) },
    { icon: User,        label: 'Customer',    value: transaction.customerName ?? '—' },
    { icon: IndianRupee, label: 'Amount',      value: formatINR(transaction.amount) },
    // Raw, unlabeled value — see this component's own header for why: the
    // enum's meaning per document type isn't confirmed, so this shows what
    // OrnaVerse reports rather than a guessed "Draft"/"Posted" string.
    ...(raw.document_status != null
      ? [{ icon: AlertCircle, label: 'Status', value: `${raw.document_status}${raw.posted_by_name ? ` · posted by ${raw.posted_by_name}` : ''}` }]
      : []),
  ];

  const skipKeys = new Set(['transaction_id', 'document_no', 'document_date', 'party_id', 'party_name', 'net_amount', 'company_id', 'current_company_id', 'document_status', 'posted_by_name']);

  const extraRows = Object.entries(raw)
    .filter(([k, v]) => !skipKeys.has(k) && v !== null && v !== undefined && v !== 'NA' && v !== '' && typeof v !== 'object')
    .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: String(v) }));

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-50 flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground">Transaction</p>
            <p className="text-sm font-semibold text-foreground">{transaction.documentNo ?? `#${transaction.transactionId}`}</p>
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

        {cancelLabel && (
          <div className="border-t border-border p-4">
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
        <p className="text-sm font-semibold text-foreground tabular-nums">{formatINR(item.amount)}</p>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );
}


function TransactionList({ hook: useHook, emptyMessage, type }) {
  const [skip, setSkip]         = useState(0);
  const [selected, setSelected] = useState(null);

  // ADDED 2026-09-09 — "Show only my transactions" toggle, requested to
  // mirror the customer profile page's own party-scoped view. Only offered
  // when a customer is actually attached (same header-level attach state
  // this file already reads for CustomerAttachedBanner above — global,
  // independent of checkout, so it's available on this plain list view
  // too). Off by default and reset per tab — TABS.map below mounts a fresh
  // TransactionList per tab, so switching tabs never silently carries the
  // filter over to a different transaction type.
  //
  // CLIENT-SIDE, not a server param — confirmed (useTransactionLists.js's
  // own header + transactionService.js) none of the 6 List endpoints
  // (Return/Refund/CreditNote/Exchange/BuyBack/URDPurchase) accept a
  // party_id filter; they're store-scoped and paginated only. So this
  // narrows whatever page is ALREADY loaded to this customer's own rows in
  // it — the same page window as the unfiltered view, not a guaranteed
  // search of this customer's entire history. That's a real, different
  // (lesser) guarantee than the customer profile page's own 360 tab, which
  // calls a genuinely party_id-scoped endpoint — see useCustomer360.js.
  // Reusing that richer endpoint here instead would need per-tab mapping
  // work (its response has no Refund/CreditNote arrays at all), so this
  // stays a straightforward in-page filter for now, honestly presented as
  // such via the "on this page" wording in the empty state below.
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

  const [activeTab, setActiveTab] = useState(initialTab);
  const [view, setView]           = useState('list'); // 'list' | 'new'
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
          {/* Interstore Return entry point (2026-09-28, explicit direction) —
              a cross-branch return is a fully separate feature (/transfers,
              its own lifecycle/approval flow) that previously had no
              affordance from this page at all, only the sidebar nav. Purely
              additive: doesn't touch TABS, PillTabs, or the New/Cancel toggle
              below, which stays about THIS store's own same-store returns. */}
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
