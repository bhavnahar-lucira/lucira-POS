'use client';

import { Coins } from 'lucide-react';
import { useMetalRates } from '@/hooks/settings/useMetalRates';

const money = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/g`;

function RateSpans({ resolved }) {
  return resolved.map((r) => (
    <span
      key={r.code}
      className="whitespace-nowrap text-xs font-semibold tabular-nums text-status-made-order"
    >
      {r.code}: {money(r.rate)}
    </span>
  ));
}

export default function MetalRatesTicker() {
  const { rates, isLoading, hasAny } = useMetalRates();

  if (!isLoading && !hasAny) return null;

  const resolved = rates.filter((r) => r.rate != null);

  return (
    <div className="w-full border-b border-status-made-order/25 bg-status-made-order/10">
      <div className="mx-auto hidden flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-4 py-2.5 sm:flex md:px-6">
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-status-made-order">
          <Coins size={13} aria-hidden="true" />
          Today&rsquo;s Rates
        </span>

        {resolved.length === 0 ? (
          <span className="text-xs font-medium text-status-made-order/70">Loading…</span>
        ) : (
          <RateSpans resolved={resolved} />
        )}
      </div>
      <div className="flex items-center gap-2 overflow-hidden py-2 pl-4 sm:hidden">
        <Coins size={13} className="shrink-0 text-status-made-order" aria-hidden="true" />

        {resolved.length === 0 ? (
          <span className="text-xs font-medium text-status-made-order/70">Loading…</span>
        ) : (
          <div className="flex-1 overflow-hidden">
            <div className="flex w-max animate-marquee gap-6">
              <div className="flex shrink-0 gap-6"><RateSpans resolved={resolved} /></div>
              <div className="flex shrink-0 gap-6" aria-hidden="true"><RateSpans resolved={resolved} /></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
