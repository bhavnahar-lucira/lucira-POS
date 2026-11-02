'use client';

import { FileText, ClipboardList, UserRound } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const DOCUMENT_TYPES = [
  { value: 'invoice', label: 'Invoice', icon: FileText },
  { value: 'order',   label: 'Order',   icon: ClipboardList },
];

/**
 * @param {{
 *   documentTypes: string[], onToggleDocumentType: (value: string) => void,
 *   hasActiveFilters: boolean, onClearFilters: () => void,
 *   isSuperAdmin: boolean, availableStores: object[],
 *   storeFilter: string, onStoreFilterChange: (value: string) => void,
 *   salesPersons: string[], salesPerson: string, onSalesPersonChange: (value: string) => void,
 * }} props
 */
export default function BuyersFilterPanel({
  documentTypes,
  onToggleDocumentType,
  hasActiveFilters,
  onClearFilters,
  isSuperAdmin,
  availableStores,
  storeFilter,
  onStoreFilterChange,
  salesPersons = [],
  salesPerson = 'all',
  onSalesPersonChange,
}) {
  return (
    <div className="flex flex-col gap-5">
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="self-end text-xs font-medium text-destructive hover:underline"
        >
          Clear all
        </button>
      )}

      {isSuperAdmin && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Store</span>
          <Select value={storeFilter} onValueChange={onStoreFilterChange}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="All stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stores</SelectItem>
              {availableStores.map((store) => (
                <SelectItem key={store.company_id} value={String(store.company_id)}>
                  {store.mailing_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Sales person</span>
        <Select value={salesPerson} onValueChange={onSalesPersonChange}>
          <SelectTrigger className="h-10 w-full" aria-label="Sales person">
            <SelectValue placeholder="All sales persons" />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            <SelectItem value="all">All sales persons</SelectItem>
            {salesPersons.map((name) => (
              <SelectItem key={name} value={name}>
                <span className="flex items-center gap-2">
                  <UserRound size={14} className="text-muted-foreground" aria-hidden="true" />
                  {name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {salesPersons.length === 0 && (
          <span className="text-xs text-muted-foreground">No sales person names recorded for this store yet.</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Document Type</span>
        <div className="flex flex-row flex-wrap items-center gap-5">
          {DOCUMENT_TYPES.map(({ value, label, icon: Icon }) => (
            <Label
              key={value}
              htmlFor={`doc-type-${value}`}
              className="flex items-center gap-2 text-sm font-normal cursor-pointer select-none"
            >
              <Checkbox
                id={`doc-type-${value}`}
                checked={documentTypes.includes(value)}
                onCheckedChange={() => onToggleDocumentType(value)}
              />
              <Icon size={14} className="text-muted-foreground" aria-hidden="true" />
              {label}
            </Label>
          ))}
        </div>
      </div>
    </div>
  );
}
