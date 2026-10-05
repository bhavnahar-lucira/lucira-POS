'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import {
  ShoppingBag,
  RotateCcw,
  ArrowLeftRight,
  Gem,
  Coins,
  CreditCard,
  FileText,
  BookOpen,
  FileSpreadsheet,
  ScanLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBarcodeLookup } from '@/hooks/catalog/useBarcodeLookup';
import { selectActiveStoreId } from '@/store/slices/storeSlice';

// Code-split — pulls in @zxing/browser, only needed once the operator
// actually opens the scanner (same lazy pattern as ProductSearchBar's own).
const BarcodeScannerModal = dynamic(
  () => import('@/components/features/catalog/BarcodeScannerModal'),
  { ssr: false }
);

// All six transaction types route to the single /transactions page, which
// deep-links via ?tab=<id>. &new=1 additionally opens straight into that
// tab's "New" entry form — these buttons are labeled as actions ("New
// Return", "Refund", "Credit Note"...), not "go look at the Returns tab", so
// landing on the plain list defeated the point (reported directly, 2026-09-29).

const QUICK_ACTIONS = [
  {
    id:          'new-sale',
    label:       'New Sale',
    description: 'Browse catalog',
    icon:        ShoppingBag,
    href:        '/catalog',
    accent:      'bg-secondary text-primary border border-accent/30 shadow-sm hover:shadow-md',
  },
  {
    id:          'scan-barcode',
    label:       'Scan Barcode',
    description: 'Look up a product',
    icon:        ScanLine,
    // No href — opens the camera scanner directly (see QuickActionGrid's
    // `kind: 'scan'` handling below) instead of navigating anywhere first.
    kind:        'scan',
    accent:      'bg-card text-foreground border border-border shadow-sm hover:shadow-md hover:border-accent/40 hover:text-accent',
  },
  {
    id:          'new-return',
    label:       'New Return',
    description: 'Process a return',
    icon:        RotateCcw,
    href:        '/transactions?tab=returns&new=1',
    accent:      'bg-card text-foreground border border-border shadow-sm hover:shadow-md hover:border-accent/40 hover:text-accent',
  },
  {
    id:          'refund',
    label:       'Refund',
    description: 'Refund customer',
    icon:        CreditCard,
    href:        '/transactions?tab=refunds&new=1',
    accent:      'bg-card text-foreground border border-border shadow-sm hover:shadow-md hover:border-accent/40 hover:text-accent',
  },
  {
    id:          'credit-note',
    label:       'Credit Note',
    description: 'Issue store credit',
    icon:        FileText,
    href:        '/transactions?tab=credit-notes&new=1',
    accent:      'bg-card text-foreground border border-border shadow-sm hover:shadow-md hover:border-accent/40 hover:text-accent',
  },
  {
    id:          'exchange',
    label:       'Exchange',
    description: 'Item exchange',
    icon:        ArrowLeftRight,
    href:        '/transactions?tab=exchange&new=1',
    accent:      'bg-card text-foreground border border-border shadow-sm hover:shadow-md hover:border-accent/40 hover:text-accent',
  },
  {
    id:          'buyback',
    label:       'Buyback',
    description: 'Buy from customer',
    icon:        Gem,
    href:        '/transactions?tab=buyback&new=1',
    accent:      'bg-card text-foreground border border-border shadow-sm hover:shadow-md hover:border-accent/40 hover:text-accent',
  },
  {
    id:          'urd-purchase',
    label:       'URD Purchase',
    description: 'Record purchase',
    icon:        Coins,
    href:        '/transactions?tab=urd&new=1',
    accent:      'bg-card text-foreground border border-border shadow-sm hover:shadow-md hover:border-accent/40 hover:text-accent',
  },
  {
    id:          'scheme-payment',
    label:       'Scheme Payment',
    description: 'Collect instalment',
    icon:        BookOpen,
    href:        '/schemes',
    accent:      'bg-card text-foreground border border-border shadow-sm hover:shadow-md hover:border-accent/40 hover:text-accent',
  },
  {
    id:          'custom',
    label:       'Custom',
    description: 'Custom Estimation',
    icon:        FileSpreadsheet,
    href:        '/estimation?view=custom',
    accent:      'bg-card text-foreground border border-border shadow-sm hover:shadow-md hover:border-accent/40 hover:text-accent',
  },
];

function QuickActionButton({ action, onClick }) {
  const Icon = action.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(action)}
      aria-label={`${action.label} — ${action.description}`}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5',
        'rounded-lg p-2.5 min-h-[76px] w-full',
        'transition-all duration-standard ease-premium active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        action.accent
      )}
    >
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      <div className="text-center">
        <p className="text-[11px] font-semibold leading-tight">{action.label}</p>
      </div>
    </button>
  );
}

export default function QuickActionGrid() {
  const router = useRouter();
  const activeStoreId = useSelector(selectActiveStoreId);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const { handleBarcodeDetected } = useBarcodeLookup({ storeId: activeStoreId });

  const handleActionClick = (action) => {
    if (action.kind === 'scan') {
      setIsScannerOpen(true);
      return;
    }
    router.push(action.href);
  };

  const handleDetected = (code) => {
    setIsScannerOpen(false);
    handleBarcodeDetected(code);
  };

  return (
    <section aria-labelledby="quick-actions-heading" className="rounded-xl border border-border bg-card shadow-sm p-5 h-full">
      <h2
        id="quick-actions-heading"
        className="font-heading text-base text-foreground mb-3"
      >
        Quick Actions
      </h2>

      <div className="grid grid-cols-3 gap-2.5">
        {QUICK_ACTIONS.map((action) => (
          <QuickActionButton
            key={action.id}
            action={action}
            onClick={handleActionClick}
          />
        ))}
      </div>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onDetected={handleDetected}
        onClose={() => setIsScannerOpen(false)}
      />
    </section>
  );
}