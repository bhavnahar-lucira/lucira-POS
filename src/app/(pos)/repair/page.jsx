'use client';

// Repair workflow — 3 linked stages, one tab each:
//   Repair In  — customer drops off an item for repair (intake)
//   Repair Out — item sent to the craftsman/workshop
//   Repair Invoice — item back, customer billed and paid
//
// Each stage references the one before it: Repair In is raised against a
// workshop Repair Order (document 75) and copies its line, RepairOut
// references the RepairIn it came from (ref_transaction_id), and
// RepairInvoice references the RepairOut it's billing. Every stage picks an
// existing record rather than searching the catalogue — staff pick the
// specific job, not an item. (The intake used to use ItemSearchPicker and
// hand-build a line; that shape isn't what the server stores. Corrected
// 2026-08-01, see [[repair-flow-contract]].)
//
// HEADER FIELDS (2026-07-28) — the "AccessDenied" framing above is STALE.
// Confirmed live 2026-07-28 that this whole family of Create endpoints
// (Return/Refund/CreditNote/Exchange/Buyback/URDPurchase, same schema as
// RepairIn/Out/Invoice) actually 500s with a missing-header-fields error,
// not AccessDenied — see [[pos-cash-checkout-status]] memory. Applied the
// same fix here (financial_year_id/ledger_id/document_id/document_no/party
// identity/aggregate weight/receipt+balance — see
// transactionHeaderService.buildTransactionHeaderFields, useOrderHeaderConfig),
// UNVERIFIED LIVE per the user's explicit direction to code this without a
// live round-trip per flow.
//
// RECORD-TYPE FIX (2026-08-14) — "Repair In" used to stop at creating the
// workshop Repair Order (document 75) and call that done. It never created
// an actual POS RepairIn record, despite useCreateRepairIn/usePostRepairIn
// already existing fully implemented and imported into this very file —
// just never called. That's why anything raised here never showed up in
// this tab's own list (which reads real RepairIn/List), and Repair Out had
// nothing genuine to pick from. Now wired as the two real stages it always
// should have been. Also fixed in the same pass: the order's own
// financial_year_id/ledger_id were being resolved off REPAIR_IN's
// DocumentNumbering config instead of the order's own (document 75) — two
// different document types, two different control ledgers.
//
// UPDATED 2026-09-17 — the note above (both stages "blocked server-side,
// needs OrnaVerse") was wrong for stage two and has been fixed, not left
// as a platform dead-end:
//   - Stage two, POS/RepairIn/Create: NOT an OrnaVerse-side bug. Tested
//     live on UAT against a real existing repair order — the previous
//     mapOrderLineToRepairInLine() passed the order line through nearly
//     whole (~182 fields), which crashes Create every time; a minimal,
//     hand-picked line (identity + weight/pieces + the ref_* linkage back
//     to the order) succeeds reliably — verified end-to-end
//     (Create → Post → Cancel) 3 times. See repairService.js's own header
//     on that function for the full isolation. So this stage now works
//     once it's reached.
//   - Stage one, Inventory/Repair/Create (the workshop order): still
//     genuinely blocked, but narrowed rather than a blanket "any payload
//     500s" — isolated live to specifically `document_date` + `party_id`
//     present TOGETHER (reproduced with different real dates/parties);
//     each is individually fine. This is what stops this form from ever
//     reaching the now-fixed stage two, since both stages are submitted
//     together below. See buildRepairOrderPayload's own header for the
//     full repro to hand to OrnaVerse support.

import { Suspense, useState } from 'react';
import { useSelector }        from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver }        from '@hookform/resolvers/zod';
import { z }                  from 'zod';
import { toast }              from 'sonner';
import {
  Wrench, Hammer, Receipt, ChevronRight,
  RefreshCw, Plus, X, AlertTriangle,
} from 'lucide-react';

import {
  useRepairIns, useRepairOuts, useRepairInvoices,
} from '@/hooks/repair/useRepairLists';
import {
  useCreateRepairOrder,   usePostRepairOrder,
  useCreateRepairIn,      usePostRepairIn,
  useCreateRepairOut,     usePostRepairOut,
  useCreateRepairInvoice, usePostRepairInvoice, useCreateRepairInvoiceReceipt,
} from '@/hooks/repair/useRepairMutations';
import { useRepairInvoiceHelpers } from '@/hooks/repair/useRepairInvoiceHelpers';
import { usePaymentModes }     from '@/hooks/checkout/usePaymentModes';
import { paymentRequiresBank } from '@/lib/checkout/paymentModeRules';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import {
  useRepairOrders, useRepairOrderIntakeLines,
  useRepairableSoldItems, useRepairLocationId,
} from '@/hooks/repair/useRepairOrders';
import {
  priceRepairItems, buildRepairOrderPayload,
  getRepairOrderAsIntakeLines, buildRepairInPayload,
  REPAIR_TYPE, REPAIR_LOCATION_TYPE, REPAIR_ORDER_DOCUMENT_ID,
} from '@/services/repairService';
import { buildTransactionHeaderFields } from '@/services/transactionHeaderService';
import InlineLoader            from '@/components/shared/InlineLoader';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectCartCustomerId, selectCartCustomerName, selectCartCustomerMobile } from '@/store/slices/cartSlice';
import APP_CONFIG               from '@/constants/appConfig';
import { todayDateString, formatDatePadded } from '@/lib/dateUtils';
import { formatAmountOrDash } from '@/lib/priceUtils';

import PageLoader from '@/components/shared/PageLoader';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Switch }  from '@/components/ui/switch';
import PaymentModeSelect from '@/components/shared/PaymentModeSelect';
import PillTabs from '@/components/shared/PillTabs';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import CustomerAttachedBanner from '@/components/shared/CustomerAttachedBanner';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// De-duplicated 2026-09-08 — identical copies existed in estimation/page.jsx
// and transactions/page.jsx; see lib/priceUtils.js's formatAmountOrDash and
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

// Picks one record from a recent-records list (Repair In, for Repair Out;
// Repair Out, for Repair Invoice) — staff pick the specific job by document
// number, not a fresh catalog search.
function RecordPicker({ records, isLoading, selected, onSelect, emptyMessage }) {
  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading…</p>;
  if (records.length === 0) return <p className="text-xs text-muted-foreground py-2">{emptyMessage}</p>;

  if (selected) {
    const item = selected.lineItems?.[0];
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-input bg-muted/30 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{selected.documentNo}</p>
          <p className="truncate text-xs text-muted-foreground">
            {selected.customerName} {item?.item_name ? `· ${item.item_name}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => onSelect(null)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Change selection">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
      {records.map((r) => (
        <button
          key={r.transactionId}
          type="button"
          onClick={() => onSelect(r)}
          className="flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted/50"
        >
          <span className="text-sm font-medium text-foreground">{r.documentNo}</span>
          <span className="text-xs text-muted-foreground">{r.customerName} · {formatDate(r.documentDate)}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Accept for Repair — raises a REPAIR ORDER ─────────────────────────────────
// The counter raises a Repair Order (document 75), not a Repair In. Confirmed
// 2026-08-01 against OrnaVerse's own POS Repair (F5) tab, whose button reads
// "Save Repair Order". Repair In (117) / Repair Out (118) are workshop-side
// documents raised as the job moves through the workshop.
//
// Staff pick the customer's own sold items (transaction_type 3 — the repair
// filter; Return/Buyback/Exchange use 1, Credit Note uses 4), those get priced
// by Helpers/SetReturnItems, and the result becomes the order's line_items.
// See [[repair-flow-contract]].

const repairOrderSchema = z.object({
  document_date:  z.string().min(1, 'Required'),
  item_keys:      z.array(z.string()).min(1, 'Pick at least one item'),
  repair_at_ho:   z.boolean().optional(),
});

const soldItemKey = (row) =>
  `${row.document_no ?? ''}#${row.item_line_no ?? ''}#${row.transaction_item_id ?? ''}`;

function RepairInNewForm({ onDone }) {
  const storeId       = useSelector(selectActiveStoreId);
  const customerId    = useSelector(selectCartCustomerId);
  const customerName  = useSelector(selectCartCustomerName);
  // Two DIFFERENT document types, two DIFFERENT configs — this used to
  // resolve everything (including the Repair ORDER's own ledger_id) off
  // REPAIR_IN's config, which has no ledger_id row at all on this tenant.
  // The order itself (document 75) needs its own.
  const headerConfig       = useOrderHeaderConfig(REPAIR_ORDER_DOCUMENT_ID);
  const repairInHeaderConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.REPAIR_IN);

  const create = useCreateRepairOrder({ onSuccess: () => {} });
  const post   = usePostRepairOrder({ onSuccess: () => {} });
  const createIn = useCreateRepairIn({ onSuccess: () => {} });
  const postIn   = usePostRepairIn({ onSuccess: () => onDone() });

  const { handleSubmit, setValue, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(repairOrderSchema),
    defaultValues: {
      document_date: todayDateString(),
      item_keys: [], repair_at_ho: false,
    },
  });

  const selectedKeys = watch('item_keys');
  const repairAtHo   = watch('repair_at_ho');
  const { items: soldItems, isLoading: itemsLoading } = useRepairableSoldItems(customerId);
  const repairLocationId = useRepairLocationId();
  const [isPricing, setIsPricing] = useState(false);

  const selectedRows = soldItems.filter((r) => selectedKeys.includes(soldItemKey(r)));

  const toggleItem = (row) => {
    const key = soldItemKey(row);
    setValue(
      'item_keys',
      selectedKeys.includes(key)
        ? selectedKeys.filter((k) => k !== key)
        : [...selectedKeys, key],
      { shouldValidate: true },
    );
  };

  // Mode/location locks once the cart has an item — CONFIRMED LIVE
  // 2026-10-02 (real capture of OrnaVerse's own Repair > Accept for Repair
  // screen): the toggle collapses to a static "Mode: Accepting Repair ·
  // Workshop" line once an item is added, and attempting to change it shows
  // "Clear the repair cart before switching mode."
  const handleLocationChange = (ho) => {
    if (selectedKeys.length > 0) {
      return toast.error('Clear the repair cart before switching mode.');
    }
    setValue('repair_at_ho', ho);
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
    if (!selectedRows.length) return toast.error('Pick at least one item to send for repair.');
    try {
      // Line items are server-computed — priced by the same helper Return uses.
      setIsPricing(true);
      const lineItems = await priceRepairItems({
        selectedProducts: selectedRows,
        companyId: storeId,
      });
      setIsPricing(false);
      if (!lineItems.length) throw new Error('Pricing returned no line items.');

      const createRes = await create.mutateAsync(
        buildRepairOrderPayload({
          partyId: customerId, partyName: customerName,
          companyId: storeId,
          financialYearId: headerConfig.financialYearId,
          ledgerId: headerConfig.ledgerId,
          documentDate: data.document_date,
          repairType: REPAIR_TYPE.CUSTOMER_ITEM,
          repairLocationType: data.repair_at_ho
            ? REPAIR_LOCATION_TYPE.HEAD_OFFICE
            : REPAIR_LOCATION_TYPE.OUR_WORKSHOP,
          repairLocation: storeId,
          locationId: repairLocationId,
          lineItems,
          allowBackdatedEntry:      true,
          numberOfBackdatedDays:    headerConfig.numberOfBackdatedDays,
          isDocumentNumberEditable: headerConfig.isDocumentNumberEditable,
          autoPosting:              headerConfig.autoPosting,
        }),
      );
      const transactionId = createRes?.EntityId;
      if (!transactionId) throw new Error('Repair order failed — no EntityId returned.');
      // Document 75 is auto_posting TRUE, so Create already posted it.
      if (!headerConfig.autoPosting) await post.mutateAsync(transactionId);

      // Second stage — the actual POS Repair In intake, previously never
      // created at all (this page used to stop at the workshop order and
      // call that "done"). A Repair In line is COPIED from the order's own
      // line, never hand-built — see mapOrderLineToRepairInLine's header
      // comment for why. See createRepairIn's header for this step's own
      // live-test status: confirmed still not fully working on this tenant
      // as of 2026-08-14, kept here because it's the correct shape to send
      // regardless, and because Repair Order creation itself is currently
      // the blocker stopping this from ever being reached in practice.
      if (!repairInHeaderConfig.isConfigMissing) {
        const { order, lines } = await getRepairOrderAsIntakeLines(transactionId);
        if (order && lines.length) {
          const inRes = await createIn.mutateAsync(
            buildRepairInPayload({ order, lines, documentDate: data.document_date })
          );
          const repairInId = inRes?.EntityId;
          if (repairInId && !repairInHeaderConfig.autoPosting) {
            await postIn.mutateAsync(repairInId);
          }
        }
      }
      onDone();
      reset();
    } catch (err) {
      setIsPricing(false);
      toast.error(getErrorMessage(err));
    }
  };

  const isSubmitting = isPricing || create.isPending || post.isPending || createIn.isPending || postIn.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />

      {selectedKeys.length > 0 ? (
        <FormField label="Where will this be repaired?">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-input bg-muted/30 px-3 py-2.5 text-sm">
            <span className="text-foreground">Mode: Accepting Repair · {repairAtHo ? 'Head Office' : 'Workshop'}</span>
            <button type="button" onClick={() => handleLocationChange(repairAtHo)} className="text-xs font-medium text-primary">
              Change
            </button>
          </div>
        </FormField>
      ) : (
        <FormField label="Where will this be repaired?">
          <div className="flex gap-2">
            {[
              { ho: false, label: 'At our workshop' },
              { ho: true,  label: 'Send to Head Office' },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                aria-pressed={!!repairAtHo === opt.ho}
                onClick={() => handleLocationChange(opt.ho)}
                className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  !!repairAtHo === opt.ho
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FormField>
      )}

      <FormField label="Items for Repair" required error={errors.item_keys}>
        {!customerId ? (
          <p className="text-xs text-muted-foreground">
            Assign a customer to see what they&apos;ve bought.
          </p>
        ) : itemsLoading ? (
          <InlineLoader label="Loading their purchases…" />
        ) : soldItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing of this customer&apos;s is eligible for repair.
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
            {soldItems.map((row) => {
              const key = soldItemKey(row);
              const isSelected = selectedKeys.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleItem(row)}
                  className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {row.item_name || row.item_code}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {row.sku} · {row.document_no}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {row.pieces} pc · {row.weight} g
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </FormField>

      <Button
        type="submit"
        disabled={isSubmitting || !customerId || selectedKeys.length === 0}
        className="h-12 mt-1"
      >
        {isPricing ? 'Pricing items…' : isSubmitting ? 'Saving…' : 'Save Repair Order'}
      </Button>

      {/* Confirmed live 2026-08-14 (see repairService.js's
          buildRepairOrderPayload/createRepairIn headers for the full repro):
          both stages this creates currently fail server-side regardless of
          what's sent. */}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground -mt-2">
        <AlertTriangle size={13} className="shrink-0 mt-0.5 text-status-made-order" aria-hidden="true" />
        Saving is currently expected to fail — confirmed a server-side issue on
        OrnaVerse&apos;s end, not something wrong with what you entered.
      </p>
    </form>
  );
}

// ─── Repair Out — New form ──────────────────────────────────────────────────────
// Send an intake item to the craftsman. Picks the RepairIn job it belongs
// to (ref_transaction_id) rather than searching the catalog again — the
// item is already identified.

const repairOutSchema = z.object({
  document_date: z.string().min(1, 'Required'),
  location_id: z.coerce.number().min(1, 'Required'),
  item_rate: z.coerce.number().min(0, 'Required'),
});

function RepairOutNewForm({ onDone }) {
  const storeId = useSelector(selectActiveStoreId);
  const { items: repairIns, isLoading: repairInsLoading } = useRepairIns({});
  const [selectedIn, setSelectedIn] = useState(null);
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.REPAIR_OUT);

  const create = useCreateRepairOut({ onSuccess: () => {} });
  const post   = usePostRepairOut({ onSuccess: () => onDone() });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(repairOutSchema),
    defaultValues: { document_date: todayDateString(), location_id: '', item_rate: '' },
  });

  const onSubmit = async (data) => {
    if (!selectedIn) return toast.error('Select the repair intake this item belongs to.');
    const item = selectedIn.lineItems?.[0];
    if (!item) return toast.error('Selected intake has no item on record.');
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
      const pieces = item.pieces ?? 1;
      const weight = item.weight ?? 0;
      const laborCost = Number(data.item_rate);
      const createRes = await create.mutateAsync({
        ...buildTransactionHeaderFields({
          // Estimated labour cost isn't billed until Repair Invoice — track
          // as the header amount here since there's no separate tax split.
          subTotal: laborCost, taxableAmount: laborCost, taxAmount: 0, netAmount: laborCost,
          pieces, weight, netWeight: weight,
          customerId: selectedIn.customerId, customerName: selectedIn.customerName,
          activeStoreId: storeId,
          headerConfig,
          documentTypeId: APP_CONFIG.DOCUMENT_TYPES.REPAIR_OUT,
          documentDate: data.document_date,
        }),
        ref_transaction_id: selectedIn.transactionId,
        line_items: [{
          item_id:    item.item_id,
          item_code:  item.item_code,
          item_name:  item.item_name,
          pieces,
          weight,
          location_id: Number(data.location_id),
          item_rate:  laborCost,
        }],
      });
      const transactionId = createRes?.EntityId;
      if (!transactionId) throw new Error('Repair-out failed — no EntityId returned.');
      // RepairOut (118) is auto_posting TRUE — Create already posted it.
      if (!headerConfig.autoPosting) await post.mutateAsync(transactionId);
      reset();
      setSelectedIn(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const isSubmitting = create.isPending || post.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <FormField label="Repair Intake" required>
        <RecordPicker
          records={repairIns}
          isLoading={repairInsLoading}
          selected={selectedIn}
          onSelect={setSelectedIn}
          emptyMessage="No repair intakes found."
        />
      </FormField>

      {/* No confirmed location/workshop master list exists in this app yet —
          plain numeric input until one is built. */}
      <FormField label="Workshop/Location ID" required error={errors.location_id}>
        <Input type="number" inputMode="numeric" {...register('location_id')} className="h-11" />
      </FormField>

      <FormField label="Estimated Labour Cost (₹)" required error={errors.item_rate}>
        <Input type="number" inputMode="decimal" {...register('item_rate')} className="h-11" />
      </FormField>

      <Button type="submit" disabled={isSubmitting || !selectedIn} className="h-12 mt-1">
        {isSubmitting ? 'Sending…' : 'Send to Craftsman'}
      </Button>
    </form>
  );
}

// ─── Repair Invoice — New form ───────────────────────────────────────────────────
// Item is back from the craftsman — bill the customer. Picks the RepairOut
// job it's completing, sets the final charge, and takes payment.

const repairInvoiceSchema = z.object({
  document_date: z.string().min(1, 'Required'),
  item_rate: z.coerce.number().min(0, 'Required'),
  // Optional at the schema level — required only when applied balances
  // don't already cover the full amount, enforced in onSubmit where the
  // applied total is known.
  mode_id: z.coerce.number().optional().or(z.literal('')),
  // Required only for a bank-settled mode — enforced in prepareSubmit,
  // where the selected mode is actually known (same reasoning as mode_id
  // above).
  bank_pos_id: z.coerce.number().optional().or(z.literal('')),
  ref_no: z.string().optional(),
});

function RepairInvoiceNewForm({ onDone }) {
  const storeId = useSelector(selectActiveStoreId);
  const { items: repairOuts, isLoading: repairOutsLoading } = useRepairOuts({});
  const { paymentModes, isLoading: modesLoading } = usePaymentModes();
  const [selectedOut, setSelectedOut] = useState(null);
  const [appliedBalances, setAppliedBalances] = useState([]); // { code, label, amount }[]
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.REPAIR_INVOICE);

  // Advance/Scheme/Credit Note/Exchange balances this customer already has
  // on file — previously never surfaced here at all, so repair billing
  // could only take a brand-new flat payment even when the customer was
  // already carrying credit. See useRepairInvoiceHelpers header for the
  // "unverified live" caveat shared with the rest of this pass.
  const { balances, isLoading: balancesLoading } = useRepairInvoiceHelpers({
    partyId: selectedOut?.customerId ?? null,
    companyId: storeId,
  });

  const create      = useCreateRepairInvoice({ onSuccess: () => {} });
  const post        = usePostRepairInvoice({ onSuccess: () => {} });
  const addReceipt  = useCreateRepairInvoiceReceipt({ onSuccess: () => {} });

  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm({
    resolver: zodResolver(repairInvoiceSchema),
    defaultValues: {
      document_date: todayDateString(), item_rate: '', mode_id: '',
      bank_pos_id: '', ref_no: '',
    },
  });

  const itemRateEntered = Number(watch('item_rate')) || 0;
  const appliedTotal = appliedBalances.reduce((s, b) => s + b.amount, 0);
  const remainingDue = Math.max(0, +(itemRateEntered - appliedTotal).toFixed(2));

  const toggleBalance = (balance) => {
    setAppliedBalances((prev) => {
      const exists = prev.find((b) => b.code === balance.code);
      if (exists) return prev.filter((b) => b.code !== balance.code);
      return [...prev, {
        code: balance.code,
        label: balance.label,
        amount: Math.min(balance.amount, itemRateEntered || balance.amount),
      }];
    });
  };

  // Payment-confirmation gate (2026-09-07, same pattern as checkout/page.jsx
  // — see its header comment for the full rationale). The remaining balance
  // here is collected on a physical terminal too, so "Create Repair
  // Invoice" no longer submits directly: prepareSubmit runs every check
  // that DOESN'T touch the API (same checks this used to open with) and,
  // only if a real terminal payment is actually needed (remainingDue > 0),
  // opens a Yes/No gate before submitInvoice ever runs. A fully-covered
  // invoice (existing balances alone meet the full amount) has no terminal
  // step to confirm, so it still submits immediately, same as before.
  const [pendingInvoiceData, setPendingInvoiceData] = useState(null);
  const [isPaymentConfirmOpen, setIsPaymentConfirmOpen] = useState(false);

  const prepareSubmit = (data) => {
    if (!selectedOut) return toast.error('Select the repair job this invoice is for.');
    const item = selectedOut.lineItems?.[0];
    if (!item) return toast.error('Selected job has no item on record.');

    // A mode is only required for whatever isn't covered by applied
    // balances — a fully-covered invoice needs no new payment at all.
    if (remainingDue > 0 && !data.mode_id) {
      return toast.error('Select how the remaining balance is paid.');
    }
    // A bank-settled mode (Card/UPI/etc.) needs a bank account + reference
    // number, same real-world requirement as checkout.
    if (remainingDue > 0) {
      const selectedMode = paymentModes.find((m) => m.modeId === Number(data.mode_id));
      if (selectedMode && paymentRequiresBank(selectedMode)) {
        if (!data.bank_pos_id) return toast.error('Select the bank account this payment settles to.');
        if (!data.ref_no?.trim()) return toast.error('Enter a reference number for this payment.');
      }
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

    if (remainingDue > 0) {
      setPendingInvoiceData(data);
      setIsPaymentConfirmOpen(true);
    } else {
      submitInvoice(data);
    }
  };

  const handlePaymentConfirmed = () => {
    if (pendingInvoiceData) submitInvoice(pendingInvoiceData);
    setPendingInvoiceData(null);
  };

  // Nothing was submitted — no draft invoice exists to roll back. The form
  // (job, labour charge, applied balances) stays exactly as filled in so
  // the operator can just pick a different payment mode and try again.
  const handlePaymentDeclined = () => {
    setPendingInvoiceData(null);
    toast.info('Payment declined — nothing was saved.');
  };

  const submitInvoice = async (data) => {
    const item = selectedOut.lineItems?.[0];
    const itemRate = Number(data.item_rate);
    const selectedMode = data.mode_id ? paymentModes.find((m) => m.modeId === Number(data.mode_id)) : null;

    try {
      const pieces = item.pieces ?? 1;
      const weight = item.weight ?? 0;
      const createRes = await create.mutateAsync({
        ...buildTransactionHeaderFields({
          subTotal: itemRate, taxableAmount: itemRate, taxAmount: 0, netAmount: itemRate,
          pieces, weight, netWeight: weight,
          customerId: selectedOut.customerId, customerName: selectedOut.customerName,
          activeStoreId: storeId,
          headerConfig,
          documentTypeId: APP_CONFIG.DOCUMENT_TYPES.REPAIR_INVOICE,
          receiptAmount: itemRate,
          documentDate: data.document_date,
        }),
        ref_transaction_id: selectedOut.transactionId,
        line_items: [{
          item_id:    item.item_id,
          item_code:  item.item_code,
          item_name:  item.item_name,
          pieces,
          weight,
          item_rate:  itemRate,
          sub_total:  itemRate,
          taxable_amount: itemRate,
          net_amount: itemRate,
        }],
      });
      const transactionId = createRes?.EntityId;
      if (!transactionId) throw new Error('Repair invoice failed — no EntityId returned.');
      // RepairInvoice (119) is auto_posting FALSE, so this normally runs.
      if (!headerConfig.autoPosting) await post.mutateAsync(transactionId);

      // One receipt row per applied balance, same idea as the main
      // checkout's helper payments (CheckoutPaymentSection) — mode_id/
      // ledger_id omitted for these, mode_code alone identifies which
      // balance is being drawn down. UNVERIFIED LIVE — see
      // useRepairInvoiceHelpers header.
      for (const balance of appliedBalances) {
        await addReceipt.mutateAsync({
          transaction_id: transactionId,
          party_id:       selectedOut.customerId,
          company_id:     storeId,
          amount:         balance.amount,
          mode_code:      balance.code,
        });
      }

      // Whatever's left after applied balances, paid via the selected mode.
      // ledger_id sourced from the selected mode — same pattern as Refund
      // and Scheme Receipt (see usePaymentModes.js normalizeMode).
      if (remainingDue > 0) {
        await addReceipt.mutateAsync({
          transaction_id: transactionId,
          party_id:       selectedOut.customerId,
          company_id:     storeId,
          amount:         remainingDue,
          mode_id:        Number(data.mode_id),
          ledger_id:      selectedMode?.ledgerId ?? undefined,
          // Same fields as Scheme Receipt/checkout's receipt_details — NOT
          // separately confirmed live against this specific endpoint (see
          // this form's own "UNVERIFIED LIVE" note above), only sent when
          // the mode actually needed them (prepareSubmit's own gate).
          bank_pos: data.bank_pos_id || undefined,
          ref_no:   data.ref_no?.trim() || undefined,
        });
      }

      onDone();
      reset();
      setSelectedOut(null);
      setAppliedBalances([]);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const isSubmitting = create.isPending || post.isPending || addReceipt.isPending;

  return (
    <form onSubmit={handleSubmit(prepareSubmit)} className="flex flex-col gap-5">
      <FormField label="Repair Job" required>
        <RecordPicker
          records={repairOuts}
          isLoading={repairOutsLoading}
          selected={selectedOut}
          onSelect={setSelectedOut}
          emptyMessage="No repair-out jobs found."
        />
      </FormField>

      <FormField label="Labour Charge (₹)" required error={errors.item_rate}>
        <Input type="number" inputMode="decimal" {...register('item_rate')} className="h-11" />
      </FormField>

      {/* Existing balances — Advance/Scheme/Credit Note/Exchange. Previously
          not shown anywhere on this form at all (see useRepairInvoiceHelpers
          header). Only shown once a job (and so a customer) is selected. */}
      {selectedOut && !balancesLoading && balances.some((b) => b.amount > 0) && (
        <FormField label="Apply Existing Balance">
          <div className="flex flex-col gap-2">
            {balances.filter((b) => b.amount > 0).map((b) => {
              const isApplied = appliedBalances.some((a) => a.code === b.code);
              return (
                <button
                  key={b.code}
                  type="button"
                  aria-pressed={isApplied}
                  onClick={() => toggleBalance(b)}
                  className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isApplied ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <span className="text-sm font-medium text-foreground">{b.label}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatINR(b.amount)} available</span>
                </button>
              );
            })}
          </div>
        </FormField>
      )}

      {remainingDue > 0 && (
        <FormField label={appliedBalances.length > 0 ? `Remaining (${formatINR(remainingDue)}) — Payment Method` : 'Payment Method'} required error={errors.mode_id}>
          <PaymentModeSelect
            control={control}
            name="mode_id"
            paymentModes={paymentModes}
            modesLoading={modesLoading}
            bankFieldName="bank_pos_id"
            refFieldName="ref_no"
          />
        </FormField>
      )}

      <Button type="submit" disabled={isSubmitting || !selectedOut} className="h-12 mt-1">
        {isSubmitting ? 'Billing…' : 'Create Repair Invoice'}
      </Button>

      {/* Payment-confirmation gate — see prepareSubmit above. */}
      <ConfirmDialog
        isOpen={isPaymentConfirmOpen}
        onOpenChange={setIsPaymentConfirmOpen}
        title="Confirm payment on terminal"
        description={`Has the remaining ${formatINR(remainingDue)} been completed on the payment terminal? Confirming will create the repair invoice — declining will not save anything.`}
        confirmLabel="Yes, Payment Received"
        cancelLabel="No, Declined"
        confirmVariant="default"
        onConfirm={handlePaymentConfirmed}
        onCancel={handlePaymentDeclined}
      />
    </form>
  );
}

// ─── List views ───────────────────────────────────────────────────────────────

function RepairList({ hook: useHook, emptyMessage }) {
  // ADDED 2026-09-09 — same "Show only my transactions" toggle just added to
  // the Transactions tab (see TransactionList in transactions/page.jsx for
  // the full rationale) — this list shares the identical normalized shape
  // (normalizeRepairRecord in useRepairLists.js maps party_id/party_name to
  // customerId/customerName, mirroring normalizeTransaction exactly), so the
  // same client-side filter applies unchanged. Same caveat too: RepairIn/
  // Out/Invoice/List are store-scoped and paginated only, no party_id
  // param — this narrows whatever page is already loaded to the attached
  // customer's own rows in it, not a guaranteed search of their entire
  // repair history.
  const customerId   = useSelector(selectCartCustomerId);
  const customerName = useSelector(selectCartCustomerName);
  const isAttached   = !!customerId;
  const [showOnlyCustomer, setShowOnlyCustomer] = useState(false);

  const { items: allItems, isLoading, isError, refetch } = useHook({});

  const items = showOnlyCustomer && isAttached
    ? allItems.filter((item) => item.customerId === customerId)
    : allItems;

  if (isLoading) return <ListRowsSkeleton />;

  if (isError) return (
    <div className="flex flex-col items-center gap-3 py-12">
      <p className="text-sm text-muted-foreground">Failed to load records.</p>
      <button onClick={refetch} className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
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
            ? `No records for ${customerName ?? 'this customer'} on this page.`
            : emptyMessage}
        </p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {items.map((item) => (
            <div key={item.transactionId} className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border last:border-0">
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.documentNo ?? `#${item.transactionId}`}</p>
                <p className="text-xs text-muted-foreground truncate">{item.customerName ?? 'Unknown customer'}</p>
                <p className="text-xs text-muted-foreground">{formatDate(item.documentDate)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.amount != null && <p className="text-sm font-semibold text-foreground tabular-nums">{formatINR(item.amount)}</p>}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'in',      label: 'Repair In',      icon: Wrench,  hook: useRepairIns,      emptyMessage: 'No repair intakes found.', NewForm: (props) => <RepairInNewForm {...props} /> },
  { id: 'out',     label: 'Repair Out',     icon: Hammer,  hook: useRepairOuts,     emptyMessage: 'No repair-out records found.', NewForm: (props) => <RepairOutNewForm {...props} /> },
  { id: 'invoice', label: 'Repair Invoice', icon: Receipt, hook: useRepairInvoices, emptyMessage: 'No repair invoices found.', NewForm: (props) => <RepairInvoiceNewForm {...props} /> },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

function RepairScreen() {
  const storeId = useSelector((state) => state.store.activeStoreId);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [view, setView]           = useState('list');

  const activeTabConfig = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const handleTabChange = (id) => {
    setActiveTab(id);
    setView('list');
  };

  return (
    <div className="p-4 pb-8 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">Intake, craftsman handoff, and billing</p>
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
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to view repairs.</p>
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
            className="pb-1 -mx-4 px-4"
          />

          {view === 'list' && (
            <RepairList key={activeTab} hook={activeTabConfig.hook} emptyMessage={activeTabConfig.emptyMessage} />
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

export default function RepairPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RepairScreen />
    </Suspense>
  );
}
