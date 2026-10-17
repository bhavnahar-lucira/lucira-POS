'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PackageCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { useOrderFulfillment } from '@/hooks/checkout/useOrderFulfillment';
import { useCart } from '@/hooks/cart/useCart';
import { getClientActiveEnv } from '@/lib/ornaverse/activeEnvClient';

const ORNAVERSE_WEB_BASE_URL = {
  UAT:  process.env.NEXT_PUBLIC_ORNAVERSE_BASE_URL_UAT,
  LIVE: process.env.NEXT_PUBLIC_ORNAVERSE_BASE_URL_LIVE,
};

// Real stage names from OrnaVerse's own Inventory > Order Fulfilment pipeline
// (Services/Inventory/OrderItemFulfilment/List's reason_status_description) —
// confirmed live 2026-10-16 by walking a real order through that screen.
// Fulfillment is a genuinely separate, role-gated production/procurement
// workflow (raising a Work Order or Purchase Order, receiving the shipment,
// QC sign-off) that lives in OrnaVerse, not something the POS can complete —
// this just tells staff exactly what's blocking it instead of a vague "check
// back later".
const STAGE_GUIDANCE = {
  'New':             'No stock anywhere in the network yet — a Work Order or Purchase Order needs to be raised for this piece in OrnaVerse.',
  'PO Generated':    'Purchase order already raised — waiting on vendor delivery.',
  'WO Generated':    'Work order already raised — waiting on in-house production.',
  'Shipped':         'Received back — awaiting quality check before it can be invoiced.',
  'Invoice Pending': 'Marked ready on OrnaVerse’s side already — try refreshing this screen.',
  'Cancelled':       'This fulfillment line was cancelled on OrnaVerse’s side — a replacement needs to be raised there.',
};

function getStageGuidance(reasonStatusDescription) {
  return STAGE_GUIDANCE[reasonStatusDescription]
    ?? 'This moves through OrnaVerse’s own fulfillment pipeline — check back once it clears there.';
}

/**
 * @param {{ raw: object }} props
 */
export default function FulfillOrderAction({ raw }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [ornaverseBaseUrl, setOrnaverseBaseUrl] = useState(null);
  const cart = useCart();

  useEffect(() => {
    let cancelled = false;
    getClientActiveEnv().then((env) => {
      if (!cancelled) setOrnaverseBaseUrl(ORNAVERSE_WEB_BASE_URL[env]?.replace(/\/+$/, '') ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  const { readyLines, allOpenLines, isLoadingReady, isLoadingAll } = useOrderFulfillment({
    partyId: raw?.party_id,
    enabled: checked,
  });

  if (!raw?.transaction_id || !raw?.party_id) return null;

  const thisOrderReady = readyLines.filter((l) => l.document_no === raw.document_no);
  const thisOrderStatus = allOpenLines.find((l) => l.document_no === raw.document_no);
  const fulfilmentItemId = thisOrderStatus?.fulfilment_item_id ?? null;
  const fulfilmentLink = ornaverseBaseUrl && fulfilmentItemId
    ? `${ornaverseBaseUrl}/Inventory/OrderFulfilment#Inventory-OrderItemFulfilment/${fulfilmentItemId}`
    : null;

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
        <div className="rounded-lg border border-border bg-muted px-3 py-2.5 flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">
            Not ready to invoice yet
            {thisOrderStatus?.reason_status_description
              ? ` (${thisOrderStatus.reason_status_description})`
              : ''}
            . {getStageGuidance(thisOrderStatus?.reason_status_description)}
          </p>
          {fulfilmentLink && (
            <a
              href={fulfilmentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open in OrnaVerse <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
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
