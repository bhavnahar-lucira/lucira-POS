'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { usePaymentModes } from '@/hooks/checkout/usePaymentModes';
import { useRepairedItemsReadyForBilling, useRepairMutation } from '@/hooks/repair/useRepairs';
import {
  REPAIR_DOC, priceRepairInvoiceLines, applyRepairCharge, aggregateLineTotals,
  buildRepairInvoiceEntity, createRepairInvoice,
} from '@/services/repairService';
import { buildReceiptDetails } from '@/lib/checkout/documentFields';
import { paymentRequiresBank } from '@/lib/checkout/paymentModeRules';
import { selectActiveStoreId, selectActiveStoreCode } from '@/store/slices/storeSlice';
import CustomerAttachedBanner from '@/components/shared/CustomerAttachedBanner';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import SalesPersonSelect from '@/components/features/checkout/SalesPersonSelect';
import BankPosSelect from '@/components/features/checkout/BankPosSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatINR, formatDate, weight } from './repairFormat';

function errorMessage(err) {
  return err?.response?.data?.Error?.Message ?? err?.serverMessage ?? err?.message ?? 'Repair invoice save failed.';
}

const rowKey = (row) => `${row.transaction_id}-${row.transaction_item_id ?? row.item_line_no}`;

function NewRepairInvoiceFormBody({ onDone }) {
  const companyId = useSelector(selectActiveStoreId);
  const companyCode = useSelector(selectActiveStoreCode);
  const { customerId, customerName, customerMobile } = useCustomerSession();
  const headerConfig = useOrderHeaderConfig(REPAIR_DOC.INVOICE);
  const { paymentModes, isLoading: modesLoading } = usePaymentModes();
  const readyItems = useRepairedItemsReadyForBilling(customerId);

  const [selected, setSelected] = useState({});
  const [lines, setLines] = useState([]);
  const [charges, setCharges] = useState({});
  const [pricing, setPricing] = useState(false);
  const [salesPersonId, setSalesPersonId] = useState(null);
  const [modeId, setModeId] = useState(null);
  const [bankPosId, setBankPosId] = useState(null);
  const [refNo, setRefNo] = useState('');
  const [narration, setNarration] = useState('');
  const [saved, setSaved] = useState(null);


  const picked = (readyItems.data ?? []).filter((row) => selected[rowKey(row)]);
  const chargedLines = lines.map((line, i) => applyRepairCharge(line, charges[i]));
  const totals = aggregateLineTotals(chargedLines);
  const mode = paymentModes.find((m) => m.modeId === modeId);
  const needsBank = !!mode && paymentRequiresBank(mode);

  const priceSelection = async () => {
    if (!picked.length) return toast.error('Select the repaired items the customer is collecting.');
    setPricing(true);
    try {
      const priced = await priceRepairInvoiceLines({
        selectedProducts: picked, partyId: customerId,
      });
      if (!priced.length) throw new Error('OrnaVerse returned no lines for these items.');
      setLines(priced);
      setCharges({});
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPricing(false);
    }
  };

  const save = useRepairMutation(async () => {
    if (!headerConfig.isReady) {
      if (headerConfig.isError) headerConfig.refetch();
      throw new Error(headerConfig.isConfigMissing
        ? 'Repair Invoice is not set up for this store in OrnaVerse.'
        : 'Store configuration is still loading — try again in a moment.');
    }
    const receiptDetails = totals.net_amount > 0.01
      ? buildReceiptDetails({
          paymentModes: [{
            modeId: mode.modeId, modeCode: mode.modeCode, modeName: mode.modeName, ledgerId: mode.ledgerId,
            raw: mode.raw, amount: totals.net_amount, refNo: refNo.trim(), bankPosId: needsBank ? bankPosId : null,
          }],
          customerId, activeStoreId: companyId, exchangeRate: 1, headerConfig,
        })
      : [];
    const entity = await buildRepairInvoiceEntity({
      companyId, companyCode, headerConfig,
      customer: { partyId: customerId, name: customerName, mobile: customerMobile },
      salesPersonId, lines: chargedLines, receiptDetails, narration: narration.trim(),
    });
    const res = await createRepairInvoice(entity);
    if (!res?.EntityId) throw new Error('OrnaVerse did not return the new repair invoice.');
    return { id: res.EntityId, documentNo: entity.document_no, posted: entity.auto_posting };
  });

  const submit = async () => {
    if (!customerId) return toast.error('Attach the customer first.');
    if (!lines.length) return toast.error('Add the repaired items first.');
    if (!salesPersonId) return toast.error('Select the jewelry consultant.');
    if (totals.net_amount > 0.01) {
      if (!mode) return toast.error('Select how the customer is paying.');
      if (needsBank && !bankPosId) return toast.error('Select the bank account this payment settles to.');
      if (needsBank && !refNo.trim()) return toast.error('Enter the payment reference number.');
    }
    try {
      const result = await save.mutateAsync();
      setSaved(result);
      toast.success(`Repair invoice ${result.documentNo} saved.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">Repair invoice saved</p>
        <p className="font-heading text-2xl text-foreground">{saved.documentNo}</p>
        {!saved.posted && (
          <p className="max-w-sm text-sm text-muted-foreground">This store&apos;s repair invoices are saved as drafts in OrnaVerse and posted there.</p>
        )}
        <Button className="h-12" onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} emptyMessage="Attach the customer who is collecting the repaired piece." />

      {!lines.length ? (
        <div className="flex flex-col gap-2">
          <Label>Repaired items ready to bill</Label>
          {!customerId ? (
            <p className="text-sm text-muted-foreground">Attach a customer to see their repaired pieces.</p>
          ) : readyItems.isLoading ? (
            <ListRowsSkeleton />
          ) : !(readyItems.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">Nothing is back in this store for this customer yet. The piece shows here once this store authorises its Receipt From HO.</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-border">
                {readyItems.data.map((row) => {
                  const key = rowKey(row);
                  const on = !!selected[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelected((s) => ({ ...s, [key]: !on }))}
                      className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-0 ${on ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-foreground">{row.item_name ?? row.item_code}</span>
                        <span className="truncate text-xs text-muted-foreground">{row.item_code}{row.new_bag_no ? ` · ${row.new_bag_no}` : ''}</span>
                        <span className="text-xs text-muted-foreground">Repair {row.document_no} · {formatDate(row.document_date)} · {weight(row.weight)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <Button className="h-11" variant="outline" disabled={pricing || !picked.length} onClick={priceSelection}>
                {pricing ? 'Loading from OrnaVerse…' : `Add ${picked.length || ''} item${picked.length === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label>Repair charges</Label>
            <button type="button" className="text-xs font-medium text-primary" onClick={() => setLines([])}>Change items</button>
          </div>
          {chargedLines.map((line, i) => (
            <div key={`${line.item_code}-${line.item_line_no}-${i}`} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{line.item_name ?? line.item_code}</p>
                <p className="text-xs text-muted-foreground">{line.item_code} · net {weight(line.net_weight)}</p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={charges[i] ?? ''}
                  onChange={(e) => setCharges((c) => ({ ...c, [i]: e.target.value }))}
                  placeholder="Repair charge (₹)"
                  aria-label={`Repair charge for ${line.item_code}`}
                  className="h-11"
                />
                <span className="shrink-0 text-xs text-muted-foreground">+ tax {formatINR(line.tax_amount)}</span>
              </div>
            </div>
          ))}

          <div className="rounded-xl bg-muted px-4 py-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Charges</span><span className="tabular-nums">{formatINR(totals.sub_total)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{formatINR(totals.tax_amount)}</span></div>
            <div className="mt-1 flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatINR(totals.net_amount)}</span></div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Jewelry consultant</Label>
            <SalesPersonSelect companyId={companyId} value={salesPersonId} onChange={setSalesPersonId} />
          </div>

          {totals.net_amount > 0.01 && (
            <div className="flex flex-col gap-2">
              <Label>Payment ({formatINR(totals.net_amount)})</Label>
              <Select value={modeId ? String(modeId) : ''} onValueChange={(v) => setModeId(Number(v))} disabled={modesLoading}>
                <SelectTrigger className="h-11 w-full"><SelectValue placeholder={modesLoading ? 'Loading…' : 'Select payment mode'} /></SelectTrigger>
                <SelectContent>
                  {paymentModes.map((m) => <SelectItem key={m.modeId} value={String(m.modeId)}>{m.modeName}</SelectItem>)}
                </SelectContent>
              </Select>
              {needsBank && <BankPosSelect value={bankPosId} onChange={setBankPosId} />}
              {needsBank && (
                <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="Reference number" aria-label="Reference number" className="h-11" />
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="rin-note">Note</Label>
            <Textarea id="rin-note" value={narration} onChange={(e) => setNarration(e.target.value)} maxLength={250} rows={2} />
          </div>

          <Button className="h-12" disabled={save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : `Create Repair Invoice${totals.net_amount ? ` · ${formatINR(totals.net_amount)}` : ''}`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function NewRepairInvoiceForm({ onDone }) {
  const { customerId } = useCustomerSession();
  return <NewRepairInvoiceFormBody key={customerId ?? 'none'} onDone={onDone} />;
}
