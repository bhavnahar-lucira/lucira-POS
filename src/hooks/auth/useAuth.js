import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { login as loginToOrnaverse, logout as logoutFromOrnaverse } from '@/services/authService';
import { getUserStores }       from '@/services/storeService';
import { checkMetalRateToday } from '@/services/settingsService';

import {
  setAuthenticated,
  clearAuth,
  selectIsAuthenticated,
  selectAuthUser,
} from '@/store/slices/authSlice';

import {
  setAvailableStores,
  clearStore,
  selectActiveStoreId,
  selectActiveStoreName,
} from '@/store/slices/storeSlice';
import { useActiveStore } from '@/hooks/store/useActiveStore';

import { clearCart } from '@/store/slices/cartSlice';
import { clearRecentlyViewed } from '@/store/slices/recentlyViewedSlice';
import { clearWishlist } from '@/store/slices/wishlistSlice';
import { persistor } from '@/store';
import { clearAllCookies } from '@/lib/cookies';
import queryClient from '@/lib/queryClient';

import TOAST   from '@/constants/toastMessages';
import tracker from '@/lib/analytics/tracker';
import EVENTS  from '@/lib/analytics/events';

function getSafeNextPath() {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

export function useAuth() {
  const dispatch = useDispatch();
  const router   = useRouter();

  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user            = useSelector(selectAuthUser);
  const activeStoreId   = useSelector(selectActiveStoreId);
  const activeStoreName = useSelector(selectActiveStoreName);
  const { switchStore } = useActiveStore();

  const login = useCallback(async (username, password) => {
    const { username: signedInAs, isSuperAdmin } = await loginToOrnaverse(username, password);

    dispatch(setAuthenticated({ username: signedInAs, isSuperAdmin }));
    dispatch(clearStore());
    dispatch(clearCart({ reason: 'session_reset' }));
    dispatch(clearRecentlyViewed());
    dispatch(clearWishlist());
    tracker.clear();
    queryClient.clear();
    let storesData;
    try {
      storesData = await getUserStores();
    } catch (err) {
      dispatch(clearAuth());
      dispatch(clearStore());
      const wrapped = new Error('Signed in, but could not load your stores. Please try again.');
      wrapped.isPostAuthFailure = true;
      throw wrapped;
    }
    const stores = Array.isArray(storesData)
      ? storesData
      : storesData?.Entities ?? storesData?.data ?? storesData?.result ?? [];

    dispatch(setAvailableStores(stores));
    try {
      const rateCheck = await checkMetalRateToday();
      const ratesSet  = rateCheck?.is_set ?? rateCheck?.Entity?.is_set ?? true;
      if (!ratesSet) {
        toast.warning(TOAST.METAL_RATES.NOT_SET);
      }
    } catch {
      // Network or auth issue — don't block login
    }

    if (stores.length === 1) {
      const store = stores[0];
      try {
        await switchStore(store);
      } catch {
        dispatch(clearAuth());
        dispatch(clearStore());
        const wrapped = new Error('Signed in, but could not set your store. Please try again.');
        wrapped.isPostAuthFailure = true;
        throw wrapped;
      }
      tracker.trackAgent(EVENTS.AGENT_LOGIN, {
        username:   signedInAs,
        storeId:    store.company_id,
        storeName:  store.mailing_name,
        storeCount: 1,
        timestamp:  new Date().toISOString(),
      });

      toast.success(TOAST.AUTH.LOGIN_SUCCESS);
      router.replace(getSafeNextPath() ?? '/dashboard');
    } else {
      tracker.trackAgent(EVENTS.AGENT_LOGIN, {
        username:   signedInAs,
        storeId:    undefined, // not chosen yet — /store-selection is next
        storeName:  undefined,
        storeCount: stores.length,
        timestamp:  new Date().toISOString(),
      });

      toast.success(TOAST.AUTH.LOGIN_SUCCESS);
      router.replace('/store-selection');
    }
  }, [dispatch, router, switchStore]);

  const logout = useCallback(() => {
    logoutFromOrnaverse();

    if (tracker.isSessionActive()) {
      tracker.endSession('agent_logout');
    }
    tracker.trackAgent(EVENTS.AGENT_LOGOUT, {
      username:  user?.username,
      timestamp: new Date().toISOString(),
      storeId:   activeStoreId,
      storeName: activeStoreName,
    });
    dispatch(clearCart({ reason: 'session_reset' }));
    dispatch(clearAuth());
    dispatch(clearStore());
    dispatch(clearRecentlyViewed());
    dispatch(clearWishlist());
    clearAllCookies();
    persistor.purge();
    tracker.clear();
    queryClient.clear();
    toast.info(TOAST.AUTH.LOGOUT_SUCCESS);
    router.replace('/login');
  }, [dispatch, router, activeStoreId, activeStoreName, user]);

  return {
    isAuthenticated,
    user,
    login,
    logout,
  };
}
