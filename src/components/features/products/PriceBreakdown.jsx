'use client';

import { Receipt } from 'lucide-react';
import { formatAmount as money } from '@/lib/priceUtils';

function Segment({ label, value, muted = false, subtitle }) {
  return (
    <div
      className={[
        'flex min-w-26 flex-1 justify-between basis-24 flex-col gap-1 rounded-xl px-3 py-2.5',
        muted ? 'bg-muted/40' : 'bg-muted/70',
      ].join(' ')}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums text-foreground">
        {money(value)}
      </span>
      {subtitle && (
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          {subtitle}
        </span>
      )}
    </div>
  );
}

/**
 * @param {{ priced: object|null }} props
 */
export default function PriceBreakdown({ priced, showComponents = false }) {
  if (!priced) return null;
  const materialSegments = [
    { label: 'Metal',        value: priced.metal_amount,       subtitle: priced.net_weight > 0 ? `${priced.net_weight} g` : null },
    { label: 'Diamond',      value: priced.diamond_amount,      subtitle: priced.diamond_pieces > 0 ? `${priced.diamond_pieces} pcs · ${priced.diamond_weight} ct` : null },
    { label: 'Stone',        value: priced.stone_amount,        subtitle: priced.stone_pieces > 0 ? `${priced.stone_pieces} pcs · ${priced.stone_weight} ct` : null },
    { label: 'Colour Stone', value: priced.color_stone_amount,  subtitle: priced.color_stone_pieces > 0 ? `${priced.color_stone_pieces} pcs · ${priced.color_stone_weight} ct` : null },
    { label: 'Other',        value: priced.other_amount,        subtitle: priced.other_pieces > 0 ? `${priced.other_pieces} pcs · ${priced.other_weight} ct` : null },
  ].filter((s) => s.value > 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-border bg-accent/5 px-4 py-3 sm:px-5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Receipt size={14} aria-hidden="true" />
        </span>
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground sm:text-sm">
          Price Breakdown
        </h3>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3 sm:gap-2.5 sm:px-5 sm:py-4">
        {materialSegments.map((s) => (
          <Segment key={s.label} label={s.label} value={s.value} subtitle={showComponents ? s.subtitle : null} />
        ))}
        {priced.item_labour > 0 && (
          <Segment label="Making Charges" value={priced.item_labour} />
        )}
        <Segment label="Subtotal" value={priced.sub_total} muted />
        <Segment label="Taxable Amount" value={priced.taxable_amount} muted />
        <Segment label="Tax (GST)" value={priced.tax_amount} muted />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-accent/5 px-4 py-3 sm:px-5">
        <span className="text-xs font-bold text-foreground sm:text-sm">Total (incl. GST)</span>
        <span className="text-base font-bold tabular-nums text-accent sm:text-lg">
          {money(priced.net_amount)}
        </span>
      </div>
    </div>
  );
}
