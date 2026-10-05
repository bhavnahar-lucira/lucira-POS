'use client';

import { useRouter } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';

/**
 * @param {{ onNavigate?: () => void }} props
 *   onNavigate - optional callback fired before navigating (e.g. close drawer)
 */
export default function CartEmptyState({ onNavigate }) {
  const router = useRouter();

  const handleBrowse = () => {
    onNavigate?.();
    router.push('/catalog');
  };

  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand-cream)]">
        <ShoppingBag size={28} className="text-[var(--brand-primary)]" aria-hidden="true" />
      </div>
      <h3 className="text-base font-bold text-foreground mb-1">Your cart is empty</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-[24ch]">
        Add products from the catalog to get started.
      </p>
      <button
        type="button"
        onClick={handleBrowse}
        className="min-h-[44px] px-6 rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
      >
        Browse Catalog
      </button>
    </div>
  );
}