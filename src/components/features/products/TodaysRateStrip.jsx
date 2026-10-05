'use client';

import { Coins } from 'lucide-react';
import { useMetalRates } from '@/hooks/settings/useMetalRates';

const KARAT_LABELS = { '09': '9K', '14': '14K', '18': '18K', '22': '22K' };
const RATE_CODES = Object.keys(KARAT_LABELS);

const money = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/g`;

export default function TodaysRateStrip() {
  const { rates, hasAny } = useMetalRates(RATE_CODES);

  // Same rule as MetalRatesTicker — never show a strip of nothing.
  if (!hasAny) return null;

  const resolved = rates.filter((r) => r.rate != null);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-status-made-order/25 bg-status-made-order/10 px-4 py-2.5">
      <Coins size={13} className="shrink-0 text-status-made-order" aria-hidden="true" />
      {resolved.map((r) => (
        <span
          key={r.code}
          className="whitespace-nowrap text-xs font-semibold tabular-nums text-status-made-order"
        >
          {KARAT_LABELS[r.code]}: {money(r.rate)}
        </span>
      ))}
    </div>
  );
}
