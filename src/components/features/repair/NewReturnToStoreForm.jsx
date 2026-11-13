'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import {
  useReturnDestinations, usePendingReturnItems, useCompanyLocations, useRepairMutation,
} from '@/hooks/repair/useRepairs';
import { REPAIR_DOC, buildReturnToStoreEntity, createReturnToStore } from '@/services/repairService';
import { selectActiveStoreId, selectActiveStoreCode } from '@/store/slices/storeSlice';
import ListRowsSkeleton from '@/components/shared/ListRowsSkeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, weight } from './repairFormat';

function errorMessage(err) {
  return err?.response?.data?.Error?.Message ?? err?.serverMessage ?? err?.message ?? 'Return To Store save failed.';
}

const rowKey = (row) => `${row.transaction_id}-${row.transaction_item_id}`;

/** Head Office sends repaired pieces back to the store they came from (OrnaVerse's New Return To Store). */
export default function NewReturnToStoreForm({ onDone }) {
  const companyId = useSelector(selectActiveStoreId);
  const companyCode = useSelector(selectActiveStoreCode);
  const headerConfig = useOrderHeaderConfig(REPAIR_DOC.RETURN_TO_STORE);
  const destinations = useReturnDestinations();

  const [partyId, setPartyId] = useState(null);
  const [chosenLocationId, setLocationId] = useState(null);
  const [selected, setSelected] = useState({});
  const [narration, setNarration] = useState('');
  const [saved, setSaved] = useState(null);

  const destination = (destinations.data ?? []).find((d) => d.partyId === partyId) ?? null;
  const pending = usePendingReturnItems(partyId);
  const locations = useCompanyLocations(destination?.companyId);
  const locationList = locations.data ?? [];
  const defaultLocation = locationList.find((l) => /finish/i.test(l.location_name ?? '')) ?? locationList[0];
  const locationId = locationList.some((l) => l.location_id === chosenLocationId) ? chosenLocationId : defaultLocation?.location_id ?? null;
  const picked = (pending.data ?? []).filter((row) => selected[rowKey(row)]);

  const chooseStore = (value) => {
    setPartyId(Number(value));
    setSelected({});
    setLocationId(null);
  };

  const save = useRepairMutation(async () => {
    if (!headerConfig.financialYearId) throw new Error('Store configuration is still loading — try again in a moment.');
    const entity = await buildReturnToStoreEntity({
      companyId, companyCode, headerConfig, destination, locationId, items: picked, narration: narration.trim(),
    });
    const res = await createReturnToStore(entity);
    if (!res?.EntityId) throw new Error('OrnaVerse did not return the new Return To Store.');
    return { id: res.EntityId, documentNo: entity.document_no };
  });

  const submit = async () => {
    if (!destination) return toast.error('Select the store.');
    if (!locationId) return toast.error('Select the store location the pieces go into.');
    if (!picked.length) return toast.error('Select the pieces being sent back.');
    try {
      const result = await save.mutateAsync();
      setSaved(result);
      toast.success(`${result.documentNo} saved. ${destination.name} receives it under Receipt From HO.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">Return To Store saved</p>
        <p className="font-heading text-2xl text-foreground">{saved.documentNo}</p>
        <p className="max-w-sm text-sm text-muted-foreground">The store authorises it under Receipt From HO when the pieces arrive.</p>
        <Button className="h-12" onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Store</Label>
        <Select value={partyId ? String(partyId) : ''} onValueChange={chooseStore} disabled={destinations.isLoading}>
          <SelectTrigger className="h-11 w-full"><SelectValue placeholder={destinations.isLoading ? 'Loading…' : 'Select store'} /></SelectTrigger>
          <SelectContent>
            {(destinations.data ?? []).map((d) => (
              <SelectItem key={d.partyId} value={String(d.partyId)}>{d.name}{d.companyCode ? ` (${d.companyCode})` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {destination && (
        <div className="flex flex-col gap-2">
          <Label>Store location</Label>
          <Select value={locationId ? String(locationId) : ''} onValueChange={(v) => setLocationId(Number(v))} disabled={locations.isLoading}>
            <SelectTrigger className="h-11 w-full"><SelectValue placeholder={locations.isLoading ? 'Loading…' : 'Select location'} /></SelectTrigger>
            <SelectContent>
              {locationList.map((l) => (
                <SelectItem key={l.location_id} value={String(l.location_id)}>{l.location_name ?? `Location ${l.location_id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {destination && (
        <div className="flex flex-col gap-2">
          <Label>Pieces received from this store {picked.length ? `(${picked.length} selected)` : ''}</Label>
          {pending.isLoading ? (
            <ListRowsSkeleton />
          ) : !(pending.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">Nothing from this store is waiting to go back.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
              {pending.data.map((row) => {
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
                      <span className="truncate text-xs text-muted-foreground">{row.item_code}{row.bag_no ? ` · ${row.bag_no}` : ''}{row.sku ? ` · ${row.sku}` : ''}</span>
                      <span className="text-xs text-muted-foreground">Received {row.document_no} · {formatDate(row.document_date)} · {weight(row.weight)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="rpo-note">Note</Label>
        <Textarea id="rpo-note" value={narration} onChange={(e) => setNarration(e.target.value)} maxLength={250} rows={2} />
      </div>

      <Button className="h-12" disabled={save.isPending || !destination || !picked.length} onClick={submit}>
        {save.isPending ? 'Saving…' : 'Save Return To Store'}
      </Button>
    </div>
  );
}
