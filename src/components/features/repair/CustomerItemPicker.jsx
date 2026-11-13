'use client';

import { useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useItemMasterSearch } from '@/hooks/repair/useRepairs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { weight } from './repairFormat';

/** OrnaVerse's "Customer Item": pick the closest design from the item master, then record the piece's actual metal weight. */
export default function CustomerItemPicker({ items, onChange }) {
  const [query, setQuery] = useState('');
  const search = useItemMasterSearch(query);

  const add = (item) => {
    const seq = Math.max(0, ...items.map((i) => i.seq ?? 0)) + 1;
    onChange([...items, {
      key: `${item.item_id}-${seq}`,
      seq,
      item,
      pieces: item.pieces ?? 1,
      netWeight: item.net_weight ?? '',
    }]);
    setQuery('');
  };
  const update = (key, patch) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key) => onChange(items.filter((i) => i.key !== key));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search design code or name (min 3 letters)"
          aria-label="Search design"
          className="h-11 pl-9"
        />
      </div>

      {query.trim().length >= 3 && (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
          {search.isLoading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : !(search.data ?? []).length ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No designs match.</p>
          ) : (
            search.data.map((item) => (
              <button
                key={item.item_id}
                type="button"
                onClick={() => add(item)}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{item.item_name ?? item.item_code}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.item_code} · {item.karat_name ?? ''} {item.metal_color_name ?? ''} · {weight(item.weight)}
                  </span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))
          )}
        </div>
      )}

      {items.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{entry.item.item_name ?? entry.item.item_code}</p>
              <p className="truncate text-xs text-muted-foreground">{entry.item.item_code}</p>
            </div>
            <button type="button" onClick={() => remove(entry.key)} aria-label="Remove item" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['pieces', 'Pieces', '1'],
              ['netWeight', 'Metal (net) wt (g)', '0.001'],
            ].map(([field, label, step]) => (
              <div key={field} className="flex flex-col gap-1">
                <Label htmlFor={`${entry.key}-${field}`} className="text-xs">{label}</Label>
                <Input
                  id={`${entry.key}-${field}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={step}
                  value={entry[field]}
                  onChange={(e) => update(entry.key, { [field]: e.target.value })}
                  className="h-11"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
