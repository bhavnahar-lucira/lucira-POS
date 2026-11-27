'use client';

import { Bookmark } from 'lucide-react';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { useHeldFor } from '@/hooks/reserves/useHeldReserves';

/** "Reserved for <customer>" for a product's held pieces at this store. `compact` = catalog card. */
export default function ReservedForNote({ itemId, itemCode, compact = false }) {
  const held = useHeldFor(itemId, itemCode);
  const { customerId } = useCustomerSession();
  if (!held.length) return null;

  if (compact) {
    const first = held[0];
    return (
      <p className="flex items-start gap-1 text-[10px] font-medium leading-snug text-status-made-order sm:text-[11px]">
        <Bookmark size={11} className="mt-px shrink-0" aria-hidden="true" />
        <span>
          Reserved for {first.party_id === customerId ? 'this customer' : first.party_name}
          {first.mobile ? ` · ${first.mobile}` : ''}
          {held.length > 1 ? ` +${held.length - 1} more` : ''}
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-status-made-order/20 bg-status-made-order/10 px-4 py-3">
      {held.map((h) => (
        <div key={`${h.document_no}-${h.sku}`} className="flex items-start gap-2.5">
          <Bookmark size={18} className="mt-0.5 shrink-0 text-status-made-order" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-status-made-order">
              {h.sku} reserved for {h.party_id === customerId ? 'this customer' : h.party_name}
              {h.mobile ? ` · ${h.mobile}` : ''}
            </p>
            <p className="text-xs text-status-made-order/70">
              {h.document_no}
              {h.document_date ? ` · since ${new Date(h.document_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
