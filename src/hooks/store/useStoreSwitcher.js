import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useActiveStore } from '@/hooks/store/useActiveStore';
import { clearCart } from '@/store/slices/cartSlice';
import TOAST from '@/constants/toastMessages';

export function useStoreSwitcher() {
  const dispatch = useDispatch();
  const { switchStore, activeStoreId } = useActiveStore();
  const router = useRouter();

  const handleSwitchStore = useCallback(async (store) => {
    if (store.company_id === activeStoreId) {
      return;
    }
    dispatch(clearCart());

    await switchStore(store);

    const storeName = store.mailing_name ?? 'store';
    toast.success(TOAST.STORE.SWITCHED(storeName));

    router.replace('/dashboard');
  }, [activeStoreId, dispatch, switchStore, router]);

  return { handleSwitchStore };
}