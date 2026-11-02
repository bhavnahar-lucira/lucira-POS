'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import VocForm from '@/components/features/voc/VocForm';
import VocThankYouDialog from '@/components/features/voc/VocThankYouDialog';
import CustomerAttachedBanner from '@/components/shared/CustomerAttachedBanner';
import { Button } from '@/components/ui/button';
import { useCreateVoc, useVocToday } from '@/hooks/voc/useVoc';
import { selectActiveStoreId, selectActiveStoreName } from '@/store/slices/storeSlice';
import {
  selectCartCustomerId, selectCartCustomerName, selectCartCustomerMobile, selectCartCustomerContactMobile,
} from '@/store/slices/cartSlice';

function BackHeader() {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="icon" className="-ml-2 size-9" aria-label="Back to Voice of Lucira">
        <Link href="/voc"><ArrowLeft size={18} aria-hidden="true" /></Link>
      </Button>
      <p className="text-sm text-muted-foreground">New feedback</p>
    </div>
  );
}

export default function NewVocPage() {
  const router = useRouter();
  const storeId = useSelector(selectActiveStoreId);
  const storeName = useSelector(selectActiveStoreName);
  const customerId = useSelector(selectCartCustomerId);
  const customerName = useSelector(selectCartCustomerName);
  const customerMobile = useSelector(selectCartCustomerMobile);
  const contactMobile = useSelector(selectCartCustomerContactMobile);
  const today = useVocToday(customerId);
  const createVoc = useCreateVoc();
  const [thankedName, setThankedName] = useState(null);

  if (thankedName) {
    return <VocThankYouDialog customerName={thankedName} onDone={() => router.replace('/voc')} />;
  }

  if (!storeId) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to take feedback.</p>
        </div>
      </div>
    );
  }

  if (!customerId || today.isLoading || today.data?.alreadyGiven) {
    return (
      <div className="p-4 pb-8 flex flex-col gap-4 md:p-6">
        <BackHeader />
        <CustomerAttachedBanner
          customerId={customerId}
          customerName={customerName}
          emptyMessage="Assign or create the customer from the header to take feedback."
        />
        {customerId && today.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Checking today&rsquo;s visit…
          </p>
        )}
        {today.data?.alreadyGiven && (
          <div className="flex items-start gap-3 rounded-xl border border-status-in-stock/30 bg-status-in-stock/10 p-4 text-sm">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-status-in-stock" aria-hidden="true" />
            <p className="text-foreground">
              {customerName} has already given feedback at {storeName ?? 'this store'} today. Only one response per customer per day is kept.
            </p>
          </div>
        )}
      </div>
    );
  }

  const purchased = today.data?.purchased ?? null;

  const handleSubmit = (payload) => {
    createVoc.mutate(
      {
        customer: { party_id: customerId, name: customerName, mobile: contactMobile ?? customerMobile ?? null, email: null },
        ...payload,
      },
      {
        onSuccess: () => setThankedName(customerName),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="p-4 pb-8 md:p-6">
      <VocForm
        key={customerId}
        storeId={storeId}
        initial={purchased ? { answers: { q7: purchased } } : {}}
        purchasePrefilled={!!purchased}
        isSubmitting={createVoc.isPending}
        onSubmit={handleSubmit}
        header={(
          <div className="mb-3 flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="-ml-2 size-9 shrink-0" aria-label="Back to Voice of Lucira">
              <Link href="/voc"><ArrowLeft size={18} aria-hidden="true" /></Link>
            </Button>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">{customerName}</p>
              <p className="truncate text-xs text-muted-foreground">Feedback · {storeName}</p>
            </div>
          </div>
        )}
      />
    </div>
  );
}
