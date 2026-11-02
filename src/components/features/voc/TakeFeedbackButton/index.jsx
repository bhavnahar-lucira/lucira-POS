'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { Loader2, MessageSquareHeart } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { getCustomer } from '@/services/customerService';
import { isMaskedValue, normalizeCustomer } from '@/lib/normalizers/customer';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { cn } from '@/lib/utils';

const lastTen = (mobile) => String(mobile ?? '').replace(/\D/g, '').slice(-10);
const sameName = (a, b) => !!a && !!b && a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/** Finds the customer by mobile (and name, when a mobile is shared), attaches them in the header and opens the Voice of Lucira form. */
export default function TakeFeedbackButton({ mobile, name, className, size = 'default' }) {
  const router = useRouter();
  const storeId = useSelector(selectActiveStoreId);
  const { customerId, customerName, customerMobile, attach } = useCustomerSession();
  const [isFinding, setIsFinding] = useState(false);

  if (!storeId || !mobile || isMaskedValue(String(mobile))) return null;

  const handleClick = async (event) => {
    event.stopPropagation();
    if (customerId && (lastTen(customerMobile) !== lastTen(mobile) || (name && !sameName(customerName, name)))) {
      toast.error("End the current customer's visit from the header first.");
      return;
    }
    if (customerId) {
      router.push('/voc/new');
      return;
    }
    setIsFinding(true);
    try {
      const matches = (await getCustomer(lastTen(mobile)))?.data?.Entities ?? [];
      // Several customers can share a mobile; only the one named on the card is safe to attach.
      const named = matches.filter((c) => sameName(c.party_name, name));
      const entity = matches.length === 1 ? matches[0] : named.length === 1 ? named[0] : null;
      if (!entity) {
        toast.error(matches.length
          ? 'More than one customer has this mobile. Attach the right customer from the header, then tap New feedback.'
          : 'No customer found for this mobile. Add them as a customer first.');
        return;
      }
      attach(normalizeCustomer(entity), { silent: true });
      router.push('/voc/new');
    } catch {
      toast.error("Couldn't look up this customer. Please try again.");
    } finally {
      setIsFinding(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={handleClick}
      disabled={isFinding}
      className={cn('gap-1.5', className)}
    >
      {isFinding ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <MessageSquareHeart size={15} aria-hidden="true" />}
      Take feedback
    </Button>
  );
}
