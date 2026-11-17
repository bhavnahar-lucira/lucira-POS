import { Gift } from 'lucide-react';
import { getDeferredFreeGifts } from '@/services/checkoutPricingService';

export default function DeferredFreeGiftNote({ items, invoice, order, className = '' }) {
  const gifts = getDeferredFreeGifts(items, { invoice, order });
  if (!gifts) return null;
  const label = gifts.name ? `${gifts.quantity} × ${gifts.name}` : `${gifts.quantity} free gift${gifts.quantity === 1 ? '' : 's'}`;
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs text-foreground ${className}`}>
      <Gift size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <p>
        Offer applied: <strong>{label}</strong> free. The free {gifts.quantity === 1 ? 'item is' : 'items are'} not
        part of this order; {gifts.quantity === 1 ? 'it is' : 'they are'} added when the order is billed.
      </p>
    </div>
  );
}
