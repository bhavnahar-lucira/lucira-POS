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
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectCartItems } from '@/store/slices/cartSlice';
import { latestWalkinVisitId } from '@/lib/normalizers/customer';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { WALKIN_PURPOSES } from '@/constants/walkin';

const tenDigits = (mobile) => String(mobile ?? '').replace(/\D/g, '').slice(-10);

function suggestedPurpose(pathname, hasCartItems) {
  if (pathname?.startsWith('/repair')) return 'Repair';
  if (pathname?.startsWith('/schemes')) return 'Scheme payment';
  if (pathname?.startsWith('/transactions')) return 'Exchange';
  if (pathname?.startsWith('/orders')) return 'Collect order';
  if (hasCartItems || pathname?.startsWith('/checkout') || pathname?.startsWith('/cart')) return 'Buying';
  return null;
}

/**
 * Shown after "Record walk-in". An existing customer's walk-in is already recorded, so this only asks the purpose
 * (skippable). A customer with no CRM record is registered first (that records the walk-in), or attached only.
 * @param {{ customer: { customerId, customerName, customerMobile, isNew?: boolean, visitId?: number }|null, onClose: () => void }} props
 */
export default function WalkInPrompt({ customer, onClose }) {
  const companyId = useSelector(selectActiveStoreId);
  const cartItems = useSelector(selectCartItems);
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [purpose, setPurpose] = useState(null);
  const [saving, setSaving] = useState(false);
  const [registeredVisitId, setRegisteredVisitId] = useState(undefined);

  const registering = !!customer?.isNew && registeredVisitId === undefined;
  const visitId = registeredVisitId ?? customer?.visitId ?? null;
  const suggested = suggestedPurpose(pathname, cartItems.length > 0);
  const choices = [
    ...(suggested ? [suggested] : []),
    ...WALKIN_PURPOSES.filter((p) => p !== suggested && p !== 'Walk-in'),
  ];

  const close = () => { setPurpose(null); setRegisteredVisitId(undefined); onClose(); };

  const savePurpose = async (value, ovVisitId) => {
    const res = await fetch('/api/walkins/visits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyId, mobile: tenDigits(customer.customerMobile), customerId: customer.customerId, customerName: customer.customerName,
        purpose: value, ovVisitId,
      }),
    });
    if (!res.ok) throw new Error('The walk-in is recorded but its purpose could not be saved');
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CRM.VISITS(companyId) });
    queryClient.invalidateQueries({ queryKey: ['walkin-purposes', companyId] });
  };

  const save = async () => {
    setSaving(true);
    try {
      await savePurpose(purpose, visitId);
      toast.success(`Purpose saved · ${purpose}`);
      close();
    } catch (err) {
      toast.error(err?.message ?? 'Could not save the purpose');
    } finally {
      setSaving(false);
    }
  };

  const onRegistered = async (_values, registered) => {
    const id = latestWalkinVisitId(registered?.Customer, companyId);
    if (!purpose) {
      setRegisteredVisitId(id);
      return;
    }
    try {
      await savePurpose(purpose, id);
    } catch (err) {
      toast.error(err?.message ?? 'Could not save the purpose');
    }
    close();
  };

  return (
    <Dialog open={!!customer} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className={registering ? 'sm:max-w-lg max-h-[90vh] overflow-y-auto' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle>
            {registering ? `Register ${customer?.customerName || 'this customer'} as a walk-in` : 'Purpose of visit'}
          </DialogTitle>
          <DialogDescription>
            {registering
              ? 'Not in OrnaVerse CRM yet. Register them to record the walk-in, or attach only for internal use.'
              : `Walk-in recorded for ${customer?.customerName || 'this customer'}. Why did they come in?`}
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
                variant={purpose === p ? 'default' : 'outline'}
                disabled={saving}
                onClick={() => setPurpose(p)}
                aria-pressed={purpose === p}
              >
                {p}
              </Button>
            ))}
          </div>
        </div>

        {registering && customer && (
          <div className="border-t border-border pt-4">
            <WalkInRegisterForm
              defaultMobile={tenDigits(customer.customerMobile)}
              defaultName={customer.customerName ?? ''}
              onRegistered={onRegistered}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={saving}>
            {registering ? 'Attach only' : 'Skip'}
          </Button>
          {!registering && (
            <Button type="button" onClick={save} disabled={!purpose || saving} className="gap-2">
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              Save purpose
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
