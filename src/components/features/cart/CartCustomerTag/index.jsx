'use client';

import { User, X } from 'lucide-react';

/**
 * @param {{
 *   customerName: string | null,
 *   customerMobile: string | null,
 *   onDetach: () => void,
 * }} props
 */
export default function CartCustomerTag({ customerName, customerMobile, onDetach }) {
  if (!customerName) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--brand-cream)] px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <User size={16} className="text-[var(--brand-primary)] shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{customerName}</p>
          {customerMobile && (
            <p className="text-xs text-muted-foreground truncate">{customerMobile}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDetach}
        aria-label={`Remove customer ${customerName}`}
        className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}