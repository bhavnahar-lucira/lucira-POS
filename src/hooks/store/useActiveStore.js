import { useDispatch, useSelector } from 'react-redux';
import { useCallback } from 'react';

import {
  setActiveStore,
  clearStore,
  selectActiveStoreId,
  selectActiveStoreName,
  selectActiveStoreCode,
  selectAvailableStores,
} from '@/store/slices/storeSlice';
import queryClient from '@/lib/queryClient';
import { switchCompany } from '@/services/storeService';

/**
 * useActiveStore — provides active store context and store switching action.
 *
 * Provides:
 *   - activeStoreId: number | null
 *   - activeStoreName: string | null
 *   - activeStoreCode: string | null
 *   - availableStores: Store[]
 *   - switchStore(store): sets a new active store in Redux
 *   - clearActiveStore(): clears store context
 */
export function useActiveStore() {
  const dispatch = useDispatch();

  const activeStoreId = useSelector(selectActiveStoreId);
  const activeStoreName = useSelector(selectActiveStoreName);
  const activeStoreCode = useSelector(selectActiveStoreCode);
  const availableStores = useSelector(selectAvailableStores);

  /**
   * @param {{ company_id, company_name, store_code }} store
   */
  const switchStore = useCallback(async (store) => {
    await switchCompany(store.company_id);
    queryClient.invalidateQueries({
      refetchType: 'none',
      predicate: (query) => {
        const key = query.queryKey;
        if (key[0] === 'catalog' && key[1] === 'all' && key[2] === 'shared') return false;
        if (key[0] === 'shopify') return false;
        return true;
      },
    });
    dispatch(
      setActiveStore({
        storeId: store.company_id,
        storeName: store.mailing_name,
        storeCode: store.company_code ?? null,
      })
    );
  }, [dispatch]);

  const clearActiveStore = useCallback(() => {
    dispatch(clearStore());
  }, [dispatch]);

  return {
    activeStoreId,
    activeStoreName,
    activeStoreCode,
    availableStores,
    switchStore,
    clearActiveStore,
  };
}