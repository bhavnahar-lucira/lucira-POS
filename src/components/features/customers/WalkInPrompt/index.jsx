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
import { usePathname } from 'next/navigation';
import { walkInLookup } from '@/services/customerService';
import { getCustomerVisits } from '@/services/crmService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectCartItems } from '@/store/slices/cartSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { WALKIN_PURPOSES } from '@/constants/walkin';

const skipKey = (companyId, mobile) => `walkinSkip:${companyId}:${String(mobile).slice(-10)}:${new Date().toDateString()}`;
const tenDigits = (mobile) => String(mobile ?? '').replace(/\D/g, '').slice(-10);

const REPEAT_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * True when asking would be pointless: staff already recorded or skipped this customer's walk-in today, or
 * OrnaVerse already has a visit for them at this store in the last ~4 hours (it would skip a new walk-in).
 */
export async function isWalkinHandledToday(companyId, mobile) {
  try {
    if (sessionStorage.getItem(skipKey(companyId, mobile))) return true;
  } catch { /* storage unavailable */ }
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const [posRes, ornaVerse] = await Promise.all([
    fetch(`/api/walkins/visits?company_id=${companyId}&from=${start.toISOString()}&mobile=${encodeURIComponent(mobile)}`),
    getCustomerVisits({ companyId, take: 50 }).catch(() => null),
  ]);
  if (posRes.ok && ((await posRes.json()).visits ?? []).length > 0) return true;
  const since = Date.now() - REPEAT_WINDOW_MS;
  return (ornaVerse?.Entities ?? []).some((v) => tenDigits(v.mobile) === tenDigits(mobile) && new Date(v.date).getTime() >= since);
}

// The likely reason for the visit, from what the staff member is doing right now.
function suggestedPurpose(pathname, hasCartItems) {
  if (pathname?.startsWith('/repair')) return 'Repair';
  if (pathname?.startsWith('/schemes')) return 'Scheme payment';
  if (pathname?.startsWith('/transactions')) return 'Exchange';
  if (pathname?.startsWith('/orders')) return 'Collect order';
  if (hasCartItems || pathname?.startsWith('/checkout') || pathname?.startsWith('/cart')) return 'Buying';
  return null;
}

/**
 * Asks, after a customer is assigned, whether this is a real store visit. Only recording logs a walk-in.
 * A first-time customer is registered with the full Walk-in form (JC, source, interest… saved once on the customer).
 * @param {{ customer: { customerId, customerName, customerMobile, isNew?: boolean }|null, onClose: () => void }} props
 */
export default function WalkInPrompt({ customer, onClose }) {
  const companyId = useSelector(selectActiveStoreId);
  const cartItems = useSelector(selectCartItems);
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [purpose, setPurpose] = useState(null);
  const [saving, setSaving] = useState(null);

  const isNew = !!customer?.isNew;
  const suggested = suggestedPurpose(pathname, cartItems.length > 0);
  const chosenPurpose = purpose ?? suggested ?? (isNew ? 'Walk-in' : null);
  // "Walk-in" says nothing about intent, so it's only kept as a new customer's fallback, not offered as a choice.
  const choices = [
    ...(suggested ? [suggested] : []),
    ...WALKIN_PURPOSES.filter((p) => p !== suggested && p !== 'Walk-in'),
  ];

  const close = () => { setPurpose(null); onClose(); };

  const skip = () => {
    try { sessionStorage.setItem(skipKey(companyId, customer.customerMobile), '1'); } catch { /* storage unavailable */ }
    close();
  };

  const savePurpose = async (value = chosenPurpose) => {
    const res = await fetch('/api/walkins/visits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyId, mobile: tenDigits(customer.customerMobile), customerId: customer.customerId, customerName: customer.customerName, purpose: value,
      }),
    });
    if (!res.ok) throw new Error('The visit was recorded but its purpose could not be saved');
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CRM.VISITS(companyId) });
    queryClient.invalidateQueries({ queryKey: ['walkin-purposes', companyId] });
  };

  const record = async (value) => {
    setSaving(value);
    try {
      const lookup = (await walkInLookup(tenDigits(customer.customerMobile)))?.data;
      // OrnaVerse skips a walk-in within ~4 hours of the customer's last one; the POS keeps the same single entry.
      if (lookup && lookup.WalkInRecorded === false) {
        toast.info(lookup.Message || 'This customer’s walk-in is already recorded in the last few hours.');
        close();
        return;
      }
      await savePurpose(value);
      toast.success(`Walk-in recorded · ${value}`);
      close();
    } catch (err) {
      toast.error(err?.serverMessage ?? err?.message ?? 'Could not record the walk-in');
    } finally {
      setSaving(null);
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
          <DialogTitle>Is {customer?.customerName || 'this customer'} in the store?</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'First visit: pick why they came, then register them below. Skip if they are not in the store.'
              : 'Choose why they came, then record the visit. Skip if you are only looking them up.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Purpose of visit{suggested ? ` · suggested: ${suggested}` : ''}
          </span>
          <div className="flex flex-wrap gap-2">
            {choices.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={chosenPurpose === p ? 'default' : 'outline'}
                disabled={!!saving}
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
          <Button type="button" variant="outline" onClick={skip} disabled={!!saving}>Skip, just viewing</Button>
          {!isNew && (
            <Button type="button" onClick={() => record(chosenPurpose)} disabled={!chosenPurpose || !!saving} className="gap-2">
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              Record visit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
