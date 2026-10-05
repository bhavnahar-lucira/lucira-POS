'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { useOrderFulfillment } from '@/hooks/checkout/useOrderFulfillment';
import { useCart } from '@/hooks/cart/useCart';

/**
 * @param {{ raw: object }} props
 */
export default function FulfillOrderAction({ raw }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const cart = useCart();

  const { readyLines, allOpenLines, isLoadingReady, isLoadingAll } = useOrderFulfillment({
    partyId: raw?.party_id,
    enabled: checked,
  });

  if (!raw?.transaction_id || !raw?.party_id) return null;
  
  const thisOrderReady = readyLines.filter((l) => l.document_no === raw.document_no);
  const thisOrderStatus = allOpenLines.find((l) => l.document_no === raw.document_no);

  const isLoading = isLoadingReady || isLoadingAll;

  const doLoad = () => {
    cart.loadFromOrder({
      order: {
        partyId:       raw.party_id,
        partyName:     raw.party_name,
        mobile:        raw.mobile,
        transactionId: raw.transaction_id,
        documentNo:    raw.document_no,
      },
      lines: thisOrderReady,
    });
    router.push('/checkout');
  };

  const handleLoadClick = () => {
    if (!cart.isEmpty && cart.customerId && cart.customerId !== raw.party_id) {
      setShowSwitchConfirm(true);
      return;
    }
    doLoad();
  };

  return (
    <>
      {!checked ? (
        <Button variant="outline" className="w-full gap-2" onClick={() => setChecked(true)}>
          <PackageCheck size={16} aria-hidden="true" />
          Fulfill from Order
        </Button>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Checking fulfillment status…
        </div>
      ) : thisOrderReady.length > 0 ? (
        <Button variant="premium" className="w-full gap-2" onClick={handleLoadClick}>
          <PackageCheck size={16} aria-hidden="true" />
          Load {thisOrderReady.length} item{thisOrderReady.length > 1 ? 's' : ''} to Invoice
        </Button>
      ) : (
        <p className="rounded-lg border border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          Not ready to invoice yet
          {thisOrderStatus?.reason_status_description
            ? ` (status: ${thisOrderStatus.reason_status_description})`
            : ''}
          . This moves through OrnaVerse&apos;s own fulfillment pipeline —
          check back once it clears there.
        </p>
      )}

      <ConfirmDialog
        isOpen={showSwitchConfirm}
        onOpenChange={setShowSwitchConfirm}
        title="Replace current cart?"
        description={`Loading this order will clear your current cart and assign ${raw.party_name ?? 'this order\'s customer'} instead.`}
        confirmLabel="Load Order"
        cancelLabel="Keep Current Cart"
        confirmVariant="default"
        onConfirm={() => { setShowSwitchConfirm(false); doLoad(); }}
        onCancel={() => setShowSwitchConfirm(false)}
      />
    </>
  );
}
