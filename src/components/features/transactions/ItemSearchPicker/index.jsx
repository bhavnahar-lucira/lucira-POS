'use client';

// SKU search picker for Exchange/Buyback line items — the item being handed
// in by the customer isn't necessarily in this store's live stock, so this
// searches the master item catalogue (useItemMasterSearch), not
// stock-scoped catalog search.

import { useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useItemMasterSearch } from '@/hooks/transactions/useItemMasterSearch';
import { formatAmountOrDash as formatINR } from '@/lib/priceUtils';

/**
 * @param {{
 *   selectedItem?: object|null, onSelect?: (item: object) => void, onClear?: () => void,
 *   multiple?: boolean, onAdd?: (items: object[]) => void,
 *   useSearch?: Function, categories?: { value: string, label: string }[],
 * }} props
 *   categories — when given, renders a radio toggle above the search box
 *   (e.g. URD's Jewellery/Metal split) and calls useSearch(query, category)
 *   instead of useSearch(query); the list then also loads with an empty
 *   query, matching OrnaVerse's own category dialog (Metal's 2 rows show up
 *   before any text is typed).
 *   multiple — CONFIRMED LIVE 2026-10-02: OrnaVerse's own "Add Items" dialog
 *   is checkbox multi-select, not click-one-and-close. When true, renders
 *   checkboxes + an "Add N Items" button (onAdd) instead of instant
 *   single-select (onSelect/selectedItem/onClear, ignored in this mode).
 */
export default function ItemSearchPicker({
  selectedItem, onSelect, onClear,
  multiple, onAdd,
  useSearch = useItemMasterSearch, categories,
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(categories?.[0]?.value);
  const [selected, setSelected] = useState({}); // multiple mode only: item_id -> item
  // Always call with both args — useSearch impls that don't take a category
  // (e.g. useItemMasterSearch) simply ignore the extra one.
  const { results, isLoading } = useSearch(query, category);
  const showResults = categories ? true : query.trim().length >= 2;

  if (!multiple && selectedItem) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-input bg-muted/30 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{selectedItem.item_name || selectedItem.item_code}</p>
          <p className="truncate text-xs text-muted-foreground">
            {selectedItem.item_code} · {selectedItem.karat_name && selectedItem.karat_name !== 'NA' ? selectedItem.karat_name : ''} {selectedItem.metal_name && selectedItem.metal_name !== 'NA' ? selectedItem.metal_name : ''} · {formatINR(selectedItem.item_rate)}
          </p>
        </div>
        <button type="button" onClick={onClear} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Clear selected item">
          <X size={16} />
        </button>
      </div>
    );
  }

  const toggleSelected = (item) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.item_id]) delete next[item.item_id];
      else next[item.item_id] = item;
      return next;
    });
  };
  const selectedCount = Object.keys(selected).length;
  const confirmAdd = () => {
    onAdd(Object.values(selected));
    setSelected({});
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      {categories && (
        <RadioGroup value={category} onValueChange={setCategory} className="flex gap-4">
          {categories.map((c) => (
            <div key={c.value} className="flex items-center gap-1.5">
              <RadioGroupItem value={c.value} id={`item-category-${c.value}`} />
              <Label htmlFor={`item-category-${c.value}`} className="cursor-pointer text-xs font-normal">
                {c.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by SKU / item code"
          className="h-10 pl-8 text-sm"
        />
        {isLoading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {showResults && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
          {!isLoading && results.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">
              {query.trim() ? <>No items found for &ldquo;{query}&rdquo;.</> : 'No items in this category.'}
            </p>
          )}
          {results.map((item) => multiple ? (
            <label
              key={item.item_id}
              className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0 hover:bg-muted/50 cursor-pointer"
            >
              <input type="checkbox" checked={!!selected[item.item_id]} onChange={() => toggleSelected(item)} />
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{item.item_name || item.item_code}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.item_code} · {item.karat_name && item.karat_name !== 'NA' ? item.karat_name : ''} {item.metal_name && item.metal_name !== 'NA' ? item.metal_name : ''}
                </span>
              </div>
            </label>
          ) : (
            <button
              key={item.item_id}
              type="button"
              onClick={() => { onSelect(item); setQuery(''); }}
              className="flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted/50"
            >
              <span className="text-sm font-medium text-foreground">{item.item_name || item.item_code}</span>
              <span className="text-xs text-muted-foreground">
                {item.item_code} · {item.karat_name && item.karat_name !== 'NA' ? item.karat_name : ''} {item.metal_name && item.metal_name !== 'NA' ? item.metal_name : ''} · {formatINR(item.item_rate)}
              </span>
            </button>
          ))}
        </div>
      )}
      {multiple && (
        <Button
          type="button" size="sm" disabled={selectedCount === 0} onClick={confirmAdd}
          className="self-end h-8 text-xs"
        >
          Add {selectedCount || ''} Item{selectedCount === 1 ? '' : 's'}
        </Button>
      )}
    </div>
  );
}
