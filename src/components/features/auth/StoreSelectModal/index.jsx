'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Store, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveStore } from '@/hooks/store/useActiveStore';
import { useStoreSwitcher } from '@/hooks/store/useStoreSwitcher';
import TOAST from '@/constants/toastMessages';

/**
 * In-session store switcher, anchored to the StoreIndicator in the Header.
 * Selecting a different store calls useStoreSwitcher, which invalidates the
 * query cache and redirects to /dashboard.
 */
export default function StoreSelectModal({ isOpen, onClose }) {
  const { availableStores, activeStoreId } = useActiveStore();
  const { handleSwitchStore } = useStoreSwitcher();
  const [switching, setSwitching] = useState(false);

  if (!isOpen) return null;

  const handleSelect = async (store) => {
    if (store.company_id === activeStoreId) {
      onClose();
      return;
    }
    setSwitching(true);
    try {
      await handleSwitchStore(store);
      // handleSwitchStore redirects to /dashboard — onClose fires anyway
      onClose();
    } catch {
      // switchStore (inside handleSwitchStore) also switches OrnaVerse's own
      // session company and can genuinely fail (network, session expired) —
      // surface it rather than leaving the modal silently stuck open.
      toast.error(TOAST.STORE.SWITCH_FAILED);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch store"
        className={cn(
          'fixed z-50 top-[68px] left-4 right-4',
          'sm:left-auto sm:right-4 sm:w-72',
          'rounded-xl border border-border bg-card shadow-lg',
          'flex flex-col overflow-hidden'
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Store size={15} aria-hidden="true" />
            Switch Store
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close store switcher"
            className={cn(
              'flex items-center justify-center rounded-md',
              'h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <ul className="flex flex-col py-1" role="listbox" aria-label="Available stores">
          {availableStores.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No other stores available.
            </li>
          ) : (
            availableStores.map((store) => {
              const isActive = store.company_id === activeStoreId;
              return (
                <li key={store.company_id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    onClick={() => handleSelect(store)}
                    disabled={switching}
                    className={cn(
                      'flex items-center justify-between w-full px-4 py-3 min-h-[44px]',
                      'text-sm text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      isActive
                        ? 'bg-primary/8 text-foreground font-medium'
                        : 'text-foreground hover:bg-accent',
                      switching && !isActive && 'opacity-50 pointer-events-none'
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span>{store.mailing_name ?? `Store ${store.company_id}`}</span>
                      {store.company_code && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {store.company_code}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <Check
                        size={15}
                        className="text-primary shrink-0"
                        aria-label="Currently active"
                      />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </>
  );
}