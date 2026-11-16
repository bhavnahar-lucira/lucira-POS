'use client';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RECENCY_OPTIONS, FREQUENCY_OPTIONS, SORT_OPTIONS } from '@/lib/buyers/buyerFilters';

function FilterSelect({ label, value, onChange, options, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * @param {{
 *   recency: string, onRecencyChange: (v: string) => void,
 *   frequency: string, onFrequencyChange: (v: string) => void,
 *   sort: string, onSortChange: (v: string) => void,
 *   className?: string,
 * }} props
 */
export default function BuyerSegmentFilters({
  recency, onRecencyChange, frequency, onFrequencyChange, sort, onSortChange, className = '',
}) {
  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      <FilterSelect label="Days since last purchase" value={recency} onChange={onRecencyChange} options={RECENCY_OPTIONS} />
      <FilterSelect label="By Price" value={sort} onChange={onSortChange} options={SORT_OPTIONS} />
      <FilterSelect label="Frequency" value={frequency} onChange={onFrequencyChange} options={FREQUENCY_OPTIONS} />
    </div>
  );
}
