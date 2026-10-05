'use client';

import { ShieldCheck, RefreshCw, Truck, Coins } from 'lucide-react';

const TRUST_BADGES = [
  { icon: ShieldCheck, title: 'IGI Certified',         subtitle: 'Every diamond graded' },
  { icon: RefreshCw,   title: 'Lifetime Exchange',     subtitle: '100% value back' },
  { icon: Truck,       title: 'Free Insured Shipping', subtitle: 'Fully protected' },
  { icon: Coins,       title: 'Lifetime Buyback',      subtitle: 'Transparent rates' },
];

export default function ProductTrustBadge() {
  return (
    <div className="rounded-2xl bg-accent/10 p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {TRUST_BADGES.map(({ icon: Icon, title, subtitle }) => (
          <div key={title} className="flex items-center gap-2.5 rounded-2xl p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Icon size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-accent">
                {title}
              </p>
              <p className="text-xs leading-tight text-accent">
                {subtitle}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
