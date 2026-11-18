'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PhoneLink from '@/components/shared/PhoneLink';
import PurchaseHistory from '@/components/features/buyers/PurchaseHistory';
import { useBuyerHistory } from '@/hooks/buyers/useBuyerHistory';

export default function BuyerDetailPage() {
  const router = useRouter();
  const { customerId } = useParams();
  const { purchases } = useBuyerHistory(customerId);

  const first = purchases[0];
  const displayName = first?.customerName || 'Customer';
  const displayMobile = purchases.find((p) => p.customerMobile)?.customerMobile;

  return (
    <div className="flex flex-col gap-4 w-full p-4 md:p-6">
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => router.push('/buyers')}
          aria-label="Back to buyers"
          className="h-9 w-9 -ml-2 shrink-0"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground break-words">{displayName}</h2>
          {displayMobile && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              <PhoneLink phone={displayMobile} />
            </p>
          )}
        </div>
      </div>

      <PurchaseHistory customerId={customerId} />
    </div>
  );
}
