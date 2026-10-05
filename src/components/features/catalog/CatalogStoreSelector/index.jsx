'use client';

import { useMemo }     from 'react';
import { useSelector } from 'react-redux';
import { Store } from 'lucide-react';

import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';

const selectAvailableStores = (s) => s.store.availableStores ?? [];
const selectActiveStoreId   = (s) => s.store.activeStoreId;
const selectActiveStoreName = (s) => s.store.activeStoreName;

export default function CatalogStoreSelector({ catalogStoreId, onStoreChange }) {
  const availableStores = useSelector(selectAvailableStores);
  const activeStoreId   = useSelector(selectActiveStoreId);
  const activeStoreName = useSelector(selectActiveStoreName);

  // Effective store: local catalog override → Redux global
  const effectiveId = catalogStoreId ?? activeStoreId;

  // mailing_name is the display field on store objects
  const displayName = useMemo(() => {
    if (!availableStores.length) return activeStoreName ?? 'Store';
    const match = availableStores.find((s) => s.company_id === effectiveId);
    return match?.mailing_name ?? activeStoreName ?? 'Store';
  }, [availableStores, effectiveId, activeStoreName]);

  if (availableStores.length <= 1) {
    return (
      <div className="flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground sm:w-auto sm:shrink-0">
        <Store size={15} className="text-muted-foreground shrink-0" />
        <span className="max-w-[140px] truncate">{displayName}</span>
      </div>
    );
  }

  return (
    <Select value={String(effectiveId)} onValueChange={(v) => onStoreChange(Number(v))}>
      <SelectTrigger className="h-11! w-full gap-2 rounded-lg border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted sm:w-auto sm:shrink-0">
        <Store size={15} className="text-muted-foreground shrink-0" />
        <span className="max-w-[140px] truncate">{displayName}</span>
      </SelectTrigger>

      <SelectContent position="popper" align="start" sideOffset={6} className="w-56">
        {availableStores.map((store) => (
          <SelectItem key={store.company_id} value={String(store.company_id)}>
            <span className="flex flex-col">
              <span>{store.mailing_name}</span>
              {store.company_code && (
                <span className="text-xs text-muted-foreground font-normal">
                  {store.company_code}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}