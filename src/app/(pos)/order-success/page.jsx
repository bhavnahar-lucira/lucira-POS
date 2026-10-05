'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OrderConfirmationScreen from '@/components/features/checkout/OrderConfirmationScreen';

function OrderSuccessScreen() {
  const router = useRouter();
  const params = useSearchParams();

  const transactionId  = Number(params.get('transactionId')) || null;
  const documentType   = params.get('documentType') === 'order' ? 'order' : 'invoice';
  useEffect(() => {
    if (!transactionId) router.replace('/catalog');
  }, [transactionId, router]);

  if (!transactionId) return null;

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full p-4 md:p-6">
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
