'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { useRepairableSoldItems, useRepairStockLocations, useRepairMutation, useTransferRepairOrder } from '@/hooks/repair/useRepairs';
import {
  REPAIR_DOC, REPAIR_TYPE, REPAIR_LOCATION_TYPE,
  priceRepairOrderLines, priceCustomerItemLines, masterItemToRepairProduct,
  buildRepairOrderEntity, createRepairOrder,
} from '@/services/repairService';
import { selectActiveStoreId, selectActiveStoreCode } from '@/store/slices/storeSlice';
import CustomerAttachedBanner from '@/components/shared/CustomerAttachedBanner';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, weight } from './repairFormat';
import CustomerItemPicker from './CustomerItemPicker';

function errorMessage(err) {
  return err?.response?.data?.Error?.Message ?? err?.serverMessage ?? err?.message ?? 'Repair order save failed.';
}

const itemKey = (row) => `${row.transaction_id}-${row.transaction_item_id ?? row.item_line_no}-${row.sku ?? ''}`;

function NewRepairOrderFormBody({ onDone }) {
  const companyId = useSelector(selectActiveStoreId);
  const companyCode = useSelector(selectActiveStoreCode);
  const { customerId, customerName } = useCustomerSession();
  const headerConfig = useOrderHeaderConfig(REPAIR_DOC.ORDER);

  const [locationType, setLocationType] = useState(REPAIR_LOCATION_TYPE.HEAD_OFFICE);
  const [chosenLocationId, setStockLocationId] = useState(null);
  const [source, setSource] = useState(REPAIR_TYPE.SOLD_ITEM);
  const [customerItems, setCustomerItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [narration, setNarration] = useState('');
  const [saved, setSaved] = useState(null);

  const soldItems = useRepairableSoldItems(customerId);
  const stockLocations = useRepairStockLocations(locationType);
  const locations = stockLocations.data?.locations ?? [];
  const transfer = useTransferRepairOrder();

  const stockLocationId = locations.some((l) => l.location_id === chosenLocationId)
    ? chosenLocationId
    : (locations.length === 1 ? locations[0].location_id : null);


  const picked = (soldItems.data ?? []).filter((row) => selected[itemKey(row)]);

  const save = useRepairMutation(async () => {
    if (!headerConfig.isReady) {
      if (headerConfig.isError) headerConfig.refetch();
      throw new Error(headerConfig.isConfigMissing
        ? 'Repair Order is not set up for this store in OrnaVerse.'
        : 'Store configuration is still loading — try again in a moment.');
    }
    const repairLocation = stockLocations.data?.repairLocation;
    if (!repairLocation) throw new Error('Head Office is not configured as the parent of this store in OrnaVerse.');
    if (!stockLocationId) {
      throw new Error(locations.length
        ? 'Select the repair stock location.'
        : `No repair stock location is set up for ${locationType === REPAIR_LOCATION_TYPE.HEAD_OFFICE ? 'Head Office' : 'this store'} in OrnaVerse.`);
    }
    const lines = source === REPAIR_TYPE.CUSTOMER_ITEM
      ? await priceCustomerItemLines({
          companyId,
          products: customerItems.map((c) => masterItemToRepairProduct(c.item, {
            pieces: Number(c.pieces) || 1, netWeight: Number(c.netWeight) || 0,
          })),
        })
      : await priceRepairOrderLines({ selectedProducts: picked, companyId });
    if (!lines.length) throw new Error('OrnaVerse returned no lines for the selected items.');
    const entity = await buildRepairOrderEntity({
      companyId, companyCode, headerConfig,
      customer: { partyId: customerId, name: customerName },
      repairType: source,
      repairLocationType: locationType,
      repairLocation,
      locationId: stockLocationId,
      lines,
      narration: narration.trim(),
    });
    const res = await createRepairOrder(entity);
    if (!res?.EntityId) throw new Error('OrnaVerse did not return the new repair order.');
    return { id: res.EntityId, documentNo: entity.document_no };
  });

  const submit = async () => {
    if (!customerId) return toast.error('Attach the customer first.');
    if (source === REPAIR_TYPE.SOLD_ITEM && !picked.length) return toast.error('Select at least one item.');
    if (source === REPAIR_TYPE.CUSTOMER_ITEM) {
      if (!customerItems.length) return toast.error('Add the customer’s piece.');
      if (customerItems.some((c) => !(Number(c.netWeight) > 0))) {
        return toast.error('Enter the metal weight of each piece.');
      }
    }
    try {
      const result = await save.mutateAsync();
      setSaved(result);
      toast.success(`Repair order ${result.documentNo} saved.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const sendToHO = async () => {
    try {
      await transfer.mutateAsync(saved.id);
      toast.success(`${saved.documentNo} sent to Head Office.`);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">Repair order saved</p>
        <p className="font-heading text-2xl text-foreground">{saved.documentNo}</p>
        {locationType === REPAIR_LOCATION_TYPE.HEAD_OFFICE ? (
          <>
            <p className="max-w-sm text-sm text-muted-foreground">Send it to Head Office when the piece is handed over to the courier.</p>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button className="h-12" disabled={transfer.isPending} onClick={sendToHO}>
                {transfer.isPending ? 'Sending…' : 'Send to Head Office now'}
              </Button>
              <Button variant="outline" className="h-12" onClick={onDone}>Later</Button>
            </div>
          </>
        ) : (
          <Button className="h-12" onClick={onDone}>Done</Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} emptyMessage="Attach the customer whose piece is coming in for repair." />

      <div className="flex flex-col gap-2">
        <Label>Where will this be repaired?</Label>
        <div className="grid grid-cols-2 gap-2">
          {[REPAIR_LOCATION_TYPE.HEAD_OFFICE, REPAIR_LOCATION_TYPE.WORKSHOP].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setLocationType(type)}
              className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-medium ${
                locationType === type ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground'
              }`}
            >
              {type === REPAIR_LOCATION_TYPE.HEAD_OFFICE ? 'Head Office' : 'Workshop (this store)'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Repair stock location</Label>
        {stockLocations.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : locations.length ? (
          <Select value={stockLocationId ? String(stockLocationId) : ''} onValueChange={(v) => setStockLocationId(Number(v))}>
            <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select location" /></SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.location_id} value={String(l.location_id)}>{l.location_name ?? l.name ?? `Location ${l.location_id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-destructive">No repair stock location is set up for this in OrnaVerse.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>What is the customer bringing in?</Label>
        <div className="grid grid-cols-2 gap-2">
          {[[REPAIR_TYPE.SOLD_ITEM, 'Bought from us'], [REPAIR_TYPE.CUSTOMER_ITEM, 'Customer’s own piece']].map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => setSource(type)}
              className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-medium ${
                source === type ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {source === REPAIR_TYPE.CUSTOMER_ITEM ? (
        <div className="flex flex-col gap-2">
          <Label>Customer item {customerItems.length ? `(${customerItems.length})` : ''}</Label>
          <CustomerItemPicker items={customerItems} onChange={setCustomerItems} />
        </div>
      ) : (
      <div className="flex flex-col gap-2">
        <Label>Sold items {picked.length ? `(${picked.length} selected)` : ''}</Label>
        {!customerId ? (
          <p className="text-sm text-muted-foreground">Attach a customer to see what they bought.</p>
        ) : soldItems.isLoading ? (
          <ListRowsSkeleton />
        ) : !(soldItems.data ?? []).length ? (
          <p className="text-sm text-muted-foreground">No purchases found for this customer.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
            {soldItems.data.map((row) => {
              const key = itemKey(row);
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
                    <span className="truncate text-xs text-muted-foreground">{row.item_code}{row.sku ? ` · ${row.sku}` : ''}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.document_no} · {formatDate(row.document_date)} · {weight(row.weight)}{row.company_code ? ` · ${row.company_code}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="repair-issue">What needs repairing?</Label>
        <Textarea id="repair-issue" value={narration} onChange={(e) => setNarration(e.target.value)} maxLength={250} rows={3} placeholder="e.g. prong loose, stone missing, resize to 14" />
      </div>

      <Button className="h-12" disabled={save.isPending || !customerId || (source === REPAIR_TYPE.CUSTOMER_ITEM ? !customerItems.length : !picked.length)} onClick={submit}>
        {save.isPending ? 'Saving…' : 'Save Repair Order'}
      </Button>
    </div>
  );
}

export default function NewRepairOrderForm({ onDone }) {
  const { customerId } = useCustomerSession();
  return <NewRepairOrderFormBody key={customerId ?? 'none'} onDone={onDone} />;
}
