'use client';

import { ArrowUpDown } from 'lucide-react';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { SORT_OPTIONS, DEFAULT_SORT } from '@/hooks/catalog/useCatalogFilters';

/**
 * @param {object}   props
 * @param {string}   props.sortBy      - Current sort value
 * @param {function} props.onSortChange - Called with new sort value string
 */
export default function CatalogSortDropdown({ sortBy, onSortChange }) {
  return (
    <Select value={sortBy || DEFAULT_SORT} onValueChange={onSortChange}>
      <SelectTrigger className="h-11! w-full gap-2 rounded-lg border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted sm:w-auto sm:shrink-0">
        <ArrowUpDown size={14} className="shrink-0 text-muted-foreground" />
        <span className="hidden text-muted-foreground sm:inline">Sort by:</span>
        <SelectValue className="truncate" />
      </SelectTrigger>
      <SelectContent position="popper" align="end" sideOffset={6} className="w-44">
        {SORT_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
