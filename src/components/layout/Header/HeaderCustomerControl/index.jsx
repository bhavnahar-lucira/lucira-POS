'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import CustomerSessionSheet from '@/components/features/customers/CustomerSessionSheet';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { selectCheckoutInProgress } from '@/store/slices/uiSlice';
import { cn } from '@/lib/utils';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export default function HeaderCustomerControl() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isAttached, customerName, customerMobile, detach } = useCustomerSession();
  const checkoutInProgress = useSelector(selectCheckoutInProgress);

  const guardedSheetOpen = () => {
    if (checkoutInProgress) {
      toast.error('A sale is being processed — please wait for it to finish before switching customers.');
      return;
    }
    setSheetOpen(true);
  };

  const guardedDetach = () => {
    if (checkoutInProgress) {
      toast.error('A sale is being processed — please wait for it to finish before removing this customer.');
      return;
    }
    detach();
  };

  if (!isAttached) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={guardedSheetOpen}
          className="flex items-center gap-2 min-h-[44px] px-4"
          aria-label="Add customer"
        >
          <UserPlus size={16} aria-hidden="true" />
          <span className="hidden md:inline text-sm font-medium">Add Customer</span>
        </Button>

        <CustomerSessionSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 rounded-sm pl-1.5 pr-2 py-1.5 min-h-[40px]',
          'border border-status-in-stock/20 bg-status-in-stock/10'
        )}
      >
        <button
          type="button"
          onClick={guardedSheetOpen}
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          aria-label={`Customer: ${customerName}. Tap to view details.`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-in-stock text-[10px] font-bold text-white">
            {getInitials(customerName)}
          </span>
          <span className="hidden sm:flex items-center gap-1 text-sm font-medium text-status-in-stock">
            <span className="truncate max-w-[120px]">{customerName}</span>
            {customerMobile && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{customerMobile}</span>
              </>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={guardedDetach}
          aria-label={`Remove customer ${customerName}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-status-in-stock/70 hover:bg-status-in-stock/20 hover:text-status-in-stock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      <CustomerSessionSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
