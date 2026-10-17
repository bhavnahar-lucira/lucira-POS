'use client';

import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';

import CustomEstimateForm from '@/components/features/estimation/CustomEstimateForm';
import { selectActiveStoreId } from '@/store/slices/storeSlice';

export default function EstimationPage() {
  const router = useRouter();
  const storeId = useSelector(selectActiveStoreId);

  return (
    <div className="p-4 pb-8 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Price quotes before a purchase</p>

      {!storeId && (
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No store selected. Please switch to a store to view quotations.</p>
        </div>
      )}

      {storeId && (
        <div className="rounded-xl border border-border bg-card p-4">
          <CustomEstimateForm
            onDone={(transactionId) =>
              router.replace(`/order-success?transactionId=${transactionId}&documentType=order`)
            }
          />
        </div>
      )}
    </div>
  );
}
