'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import WalkInRegisterForm from '@/components/features/customers/WalkInRegisterForm';
import { walkInLookup } from '@/services/customerService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { WALKIN_PURPOSES } from '@/constants/walkin';

const skipKey = (companyId, mobile) => `walkinSkip:${companyId}:${String(mobile).slice(-10)}:${new Date().toDateString()}`;
const tenDigits = (mobile) => String(mobile ?? '').replace(/\D/g, '').slice(-10);

/** True when staff already recorded or skipped this customer's walk-in today at this store. */
export async function isWalkinHandledToday(companyId, mobile) {
  try {
    if (sessionStorage.getItem(skipKey(companyId, mobile))) return true;
  } catch { /* storage unavailable */ }
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const res = await fetch(`/api/walkins/visits?company_id=${companyId}&from=${start.toISOString()}&mobile=${encodeURIComponent(mobile)}`);
  if (!res.ok) return false;
  return ((await res.json()).visits ?? []).length > 0;
}

/**
 * Asks, after a customer is assigned, whether this is a real store visit. Only recording logs a walk-in.
 * A first-time customer is registered with the full Walk-in form (JC, source, interest… saved once on the customer).
 * @param {{ customer: { customerId, customerName, customerMobile, isNew?: boolean }|null, onClose: () => void }} props
 */
export default function WalkInPrompt({ customer, onClose }) {
  const companyId = useSelector(selectActiveStoreId);
  const queryClient = useQueryClient();
  const [purpose, setPurpose] = useState(null);
  const [saving, setSaving] = useState(false);

  const isNew = !!customer?.isNew;
  const chosenPurpose = purpose ?? (isNew ? 'Walk-in' : null);

  const close = () => { setPurpose(null); onClose(); };

  const skip = () => {
    try { sessionStorage.setItem(skipKey(companyId, customer.customerMobile), '1'); } catch { /* storage unavailable */ }
    close();
  };

  const savePurpose = async () => {
    const res = await fetch('/api/walkins/visits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyId, mobile: tenDigits(customer.customerMobile), customerId: customer.customerId, customerName: customer.customerName, purpose: chosenPurpose,
      }),
    });
    if (!res.ok) throw new Error('The visit was recorded but its purpose could not be saved');
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CRM.VISITS(companyId) });
  };

  const record = async () => {
    setSaving(true);
    try {
      await walkInLookup(tenDigits(customer.customerMobile));
      await savePurpose();
      toast.success('Walk-in recorded');
      close();
    } catch (err) {
      toast.error(err?.serverMessage ?? err?.message ?? 'Could not record the walk-in');
    } finally {
      setSaving(false);
    }
  };

  const onNewCustomerRegistered = async () => {
    try {
      await savePurpose();
    } catch (err) {
      toast.error(err?.message ?? 'Could not save the purpose');
    }
    close();
  };

  return (
    <Dialog open={!!customer} onOpenChange={(open) => { if (!open) skip(); }}>
      <DialogContent className={isNew ? 'sm:max-w-lg max-h-[90vh] overflow-y-auto' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle>Record a walk-in for {customer?.customerName || 'this customer'}?</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'First visit: register the walk-in with their details. Skip if they are not in the store.'
              : 'Only real store visits should be recorded. Skip if you are just viewing.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Purpose of visit</span>
          <div className="flex flex-wrap gap-2">
            {WALKIN_PURPOSES.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={chosenPurpose === p ? 'default' : 'outline'}
                onClick={() => setPurpose(p)}
                aria-pressed={chosenPurpose === p}
              >
                {p}
              </Button>
            ))}
          </div>
        </div>

        {isNew && customer && (
          <div className="border-t border-border pt-4">
            <WalkInRegisterForm
              defaultMobile={tenDigits(customer.customerMobile)}
              defaultName={customer.customerName ?? ''}
              onRegistered={onNewCustomerRegistered}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={skip} disabled={saving}>Skip, just viewing</Button>
          {!isNew && (
            <Button type="button" onClick={record} disabled={!chosenPurpose || saving} className="gap-2">
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              Record visit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
