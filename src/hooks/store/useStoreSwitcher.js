// SEC-003: clearCart() is now dispatched on every store switch.
// Customer PII (customerId, customerName, customerMobile) was previously
// left in persisted cart state after a store switch. Clearing the cart
// ensures no customer data leaks across store contexts.

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useActiveStore } from '@/hooks/store/useActiveStore';
import { clearCart } from '@/store/slices/cartSlice';
import TOAST from '@/constants/toastMessages';

/**
 * useStoreSwitcher
 *
 * Handles mid-session store switching.
 * On switch:
 *   1. Clears the cart (SEC-003 — removes customer PII from persisted state)
 *   2. Updates active store in Redux + invalidates store-scoped query cache
 *      (both handled inside useActiveStore.switchStore — see its own header
 *      for why cache invalidation lives there and not here)
 *   3. Shows a success toast with the new store name
 *   4. Redirects to /dashboard of the newly selected store
 *
 * FIXED 2026-09-23 (reported: "switching stores takes a lot of time") — this
 * used to ALSO call a second, unfiltered queryClient.invalidateQueries()
 * after switchStore(), which had already done its own correctly-scoped
 * invalidation. That second call was redundant AND undid switchStore's own
 * protection of the two caches confirmed store-agnostic (the shared catalog
 * sweep, Shopify images) — forcing the ~15-20s catalog re-sweep on every
 * single header store-switch, on top of switchStore's own (correct) work.
 */
export function useStoreSwitcher() {
  const dispatch = useDispatch();
  const { switchStore, activeStoreId } = useActiveStore();
  const router = useRouter();

  const handleSwitchStore = useCallback(async (store) => {
    if (store.company_id === activeStoreId) {
      return;
    }

    // SEC-003: Clear cart to remove customer PII before switching context.
    // Any in-progress sale is lost — this is intentional and matches the
    // shared-device POS model where store switches are deliberate actions.
    dispatch(clearCart());

    await switchStore(store);

    const storeName = store.mailing_name ?? 'store';
    toast.success(TOAST.STORE.SWITCHED(storeName));

    router.replace('/dashboard');
  }, [activeStoreId, dispatch, switchStore, router]);

  return { handleSwitchStore };
}