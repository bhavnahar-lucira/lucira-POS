'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

function OrderFailedScreen() {
  const router = useRouter();
  const params = useSearchParams();

  const isDeclined = params.get('reason') !== 'error';
  const rawMessage = params.get('message');
  const errorMessage = rawMessage ? decodeURIComponent(rawMessage) : null;

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-10 text-center max-w-md mx-auto w-full">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/15">
        <XCircle size={36} className="text-destructive" aria-hidden="true" />
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground">
          {isDeclined ? 'Payment declined' : 'Sale could not be completed'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDeclined
            ? 'The payment was not completed on the terminal. No charge was made and nothing was saved — the cart is exactly as you left it.'
            : (errorMessage ?? 'Something went wrong while saving this sale after payment was confirmed.')}
        </p>
      </div>
      {!isDeclined && (
        <p className="flex items-start gap-1.5 rounded-lg border border-status-error/30 bg-status-error/5 px-3 py-2 text-left text-xs text-status-error">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          If the customer’s card was already charged on the terminal, check with your manager before trying again — do not charge them a second time.
        </p>
      )}

      <div className="flex w-full flex-col gap-2">
        <Button
          type="button"
          onClick={() => router.push('/checkout')}
          className="h-12 w-full text-base font-semibold"
        >
          Try Again
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/catalog')}
          className="h-12 w-full text-base font-semibold"
        >
          Back to Catalog
        </Button>
      </div>
    </div>
  );
}

export default function OrderFailedPage() {
  return (
    <Suspense fallback={null}>
      <OrderFailedScreen />
    </Suspense>
  );
}
