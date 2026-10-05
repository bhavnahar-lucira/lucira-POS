'use client';

// Read-only customer summary for the checkout screen. Reads
// useCustomerSession, shared with HeaderCustomerControl / CartCustomerTag.
// Prompts the associate to attach a customer before order submission.

import { useState } from 'react';
import { AlertCircle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CustomerDisplayCard from '@/components/features/customers/CustomerDisplayCard';
import CustomerSessionSheet from '@/components/features/customers/CustomerSessionSheet';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';

export default function CheckoutCustomerSummary() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { customerId, customerName, customerMobile, isAttached } = useCustomerSession();

  const customer = isAttached
    ? { customerId, customerName, customerMobile }
    : null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <User size={16} className="text-accent shrink-0" aria-hidden="true" />
          Customer
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsSheetOpen(true)}
          className="text-primary"
        >
          {isAttached ? 'Change' : 'Attach'}
        </Button>
      </div>

      {isAttached ? (
        <CustomerDisplayCard customer={customer} />
      ) : (
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          className="flex items-center gap-3 rounded-lg border border-dashed border-status-made-order/40 bg-status-made-order/10 px-3 py-3 text-left min-h-[44px]"
        >
          <AlertCircle size={18} className="text-status-made-order shrink-0" aria-hidden="true" />
          <span className="text-sm text-status-made-order">
            No customer assigned. Tap to assign a customer before placing the order.
          </span>
        </button>
      )}

      <CustomerSessionSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </section>
  );
}