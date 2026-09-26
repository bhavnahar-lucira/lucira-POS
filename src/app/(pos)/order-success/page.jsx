'use client';

// Dedicated route for a completed sale — was an inline component swap
// inside checkout/page.jsx (isConfirmed && <OrderConfirmationScreen />);
// moved to its own page (2026-09-07) per explicit product decision: a real
// URL for "this sale is done" that survives a refresh, can be bookmarked/
// reopened, and reads unambiguously in the browser's own back/forward
// history — an inline swap on /checkout could not do any of that, and a
// stray back-navigation risked landing an operator back on a "confirmed"
// checkout screen with no cart left to show.
//
// transactionId/documentType travel via the URL
// (?transactionId=&documentType=) rather than as component props —
// checkout/page.jsx pushes this route right after placeOrder/placeInvoice
// resolves; see that file's handlePaymentConfirmed for the write side of
// this contract.
//
// No coinsRedeemed here (removed 2026-09-25) — Nector Loyalty is a real
// payment mode now, so it's already a receipt_details[] row on the posted
// document itself; OrderConfirmationScreen's own Retrieve call reflects it
// correctly without anything extra carried through the URL.

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OrderConfirmationScreen from '@/components/features/checkout/OrderConfirmationScreen';

function OrderSuccessScreen() {
  const router = useRouter();
  const params = useSearchParams();

  const transactionId  = Number(params.get('transactionId')) || null;
  const documentType   = params.get('documentType') === 'order' ? 'order' : 'invoice';

  // Defensive — this route only ever makes sense right after a real
  // create/post succeeded (see checkout/page.jsx). Landing here any other
  // way (a bookmarked/shared link, a stray back-navigation with a stale
  // query string) has nothing to confirm, so send the operator somewhere
  // that does rather than showing a screen permanently stuck on "Loading
  // invoice…" — OrderConfirmationScreen's own Retrieve never resolves
  // without a real id.
  useEffect(() => {
    if (!transactionId) router.replace('/catalog');
  }, [transactionId, router]);

  if (!transactionId) return null;

  return (
    <div className="max-w-3xl mx-auto w-full p-4 md:p-6">
      <OrderConfirmationScreen
        transactionId={transactionId}
        documentType={documentType}
      />
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={null}>
      <OrderSuccessScreen />
    </Suspense>
  );
}
