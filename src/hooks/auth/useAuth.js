// src/hooks/auth/useAuth.js
// Authentication — login, logout, store selection post-login.

import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'react-toastify';

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

// Reads ?next= off the CURRENT url (the /login page itself), not useSearchParams —
// avoids requiring every useAuth() call site to sit inside a Suspense boundary
// just for this. Only ever returns a same-origin path starting with a single
// "/" (never "//host/..." or "https://...") — an open-redirect guard, since
// this value ultimately comes from interceptors.js's forced-logout redirect,
// which itself just echoes back whatever page the operator happened to be on.
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
    // Establishes the operator's real OrnaVerse session (see
    // lib/ornaverse/session.js) — this one call now covers everything the
    // old flow needed two for (an OAuth token, plus a separate cookie
    // session for printing): there's only one session, and it's the real
    // person's.
    const { username: signedInAs, isSuperAdmin } = await loginToOrnaverse(username, password);

    dispatch(setAuthenticated({ username: signedInAs, isSuperAdmin }));

    // Store context is session-specific — never trust a store id persisted
    // from a previous login. Without this, a stale activeStoreId survives
    // in localStorage (store is in the persist whitelist) and passes
    // StoreGuard's truthy check, so every store-scoped call (Order/List,
    // BuyBack/List, Exchange/List, Return/List, ...) gets sent with an
    // invalid company_id and the API rejects them with 400 — until the
    // user manually clears site data. Reset here so it's always re-derived
    // from this login's GetUserStores response.
    dispatch(clearStore());

    // Defensive reset of whatever local state happened to survive a
    // previous session that ended WITHOUT going through logout() (closing
    // the tab, a crashed dev server, a session that simply expired with no
    // API call ever firing to trigger the 401 auto-logout in
    // interceptors.js) — otherwise cart.customerId and whichever React
    // Query cache entries happened to be warm sit in localStorage/memory,
    // ready to silently reattach or serve stale data to whoever logs in
    // next, regardless of which agent this is.
    // reason: 'session_reset' — same flag logout() uses (see below) and for
    // the same reason: this is a defensive reset of whatever local state
    // happened to survive, NOT a resolved sale. A bare clearCart() tells
    // abandonedCartMiddleware the opposite — "sale resolved, DELETE
    // whatever's saved for this customer" — which here would have deleted
    // a real customer's genuinely-saved abandoned cart just because a
    // stale local session happened to still be showing them attached.
    // session_reset instead re-saves (never deletes) whatever the stale
    // local cart held, under that customer's own id, exactly like logout's
    // own comment describes. Also takes recentlyViewed/wishlist with it via
    // their own middlewares' 'cart/clearCart' case. queryClient.clear() on
    // top of that matters whenever the two most recent sessions on this
    // terminal were different agents: without it, cached responses (payment
    // modes, sales persons, catalog prices, ...) under the same query keys
    // would still be served straight from memory to this brand-new session
    // until they happened to expire on their own.
    dispatch(clearCart({ reason: 'session_reset' }));
    dispatch(clearRecentlyViewed());
    dispatch(clearWishlist());
    tracker.clear();
    queryClient.clear();

    // getUserStores() had no try/catch here at one point — dispatch(setAuthenticated(...))
    // above already flipped isAuthenticated true — LoginForm's own
    // redirect-on-isAuthenticated effect and StoreGuard (bounces an
    // authenticated-but-store-less session to /store-selection's "No
    // stores are assigned to your account" screen) can both race ahead of
    // a transient failure here, since credentials were genuinely valid at
    // this point — the session was already established. Roll back auth
    // state so isAuthenticated goes back to false (self-corrects the
    // redirect races above), and flag the error so LoginForm's catch can
    // tell this apart from a real bad-credentials rejection.
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

    // Non-blocking startup check — warn if metal rates not set for today.
    // Failure is silently swallowed so it never blocks login.
    try {
      const rateCheck = await checkMetalRateToday();
      const ratesSet  = rateCheck?.is_set ?? rateCheck?.Entity?.is_set ?? true;
      if (!ratesSet) {
        toast.warn(TOAST.METAL_RATES.NOT_SET);
      }
    } catch {
      // Network or auth issue — don't block login
    }

    if (stores.length === 1) {
      const store = stores[0];
      // Also switches OrnaVerse's own session company (see
      // useActiveStore.js's switchStore) — a single-store account's
      // session already defaults to its one company in practice, but going
      // through the same shared path as every other store change means
      // that's guaranteed rather than assumed.
      try {
        await switchStore(store);
      } catch {
        dispatch(clearAuth());
        dispatch(clearStore());
        const wrapped = new Error('Signed in, but could not set your store. Please try again.');
        wrapped.isPostAuthFailure = true;
        throw wrapped;
      }

      // Same shape as the multi-store branch below (2026-09-28, normalized
      // for the WebEngage migration — the two branches used to send
      // different fields, which would have made event_type "Agent_Login"
      // carry an inconsistent attribute set depending on account type).
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
    // Drop the operator's OrnaVerse session server-side too, so signing out
    // actually ends it rather than leaving it to age out.
    logoutFromOrnaverse();

    if (tracker.isSessionActive()) {
      tracker.endSession('agent_logout');
    }

    // Captured from the selectors above, BEFORE the dispatch(clearStore())
    // a few lines down wipes it — trackAgent() (unlike track()) has no
    // session to auto-derive fields from, so a caller has to pass its own.
    // username added 2026-09-28 (was missing entirely) — without it, this
    // event fell back to an anonymous WebEngage identity instead of landing
    // on the same agent profile AGENT_LOGIN did.
    tracker.trackAgent(EVENTS.AGENT_LOGOUT, {
      username:  user?.username,
      timestamp: new Date().toISOString(),
      storeId:   activeStoreId,
      storeName: activeStoreName,
    });

    // abandonedCartMiddleware's 'cart/clearCart' case (see its own comment)
    // needs the session to still be live to actually save the cart to Mongo
    // before it's wiped locally — dispatch() is synchronous, so this must
    // run BEFORE clearAuth()/clearStore() below, not after.
    //
    // reason: 'session_reset' — see abandonedCartMiddleware's cart/clearCart
    // case. This is the OPERATOR's session ending, not the customer's cart
    // being resolved — a customer who still has an unpaid cart at logout
    // should have it PRESERVED as abandoned, not deleted, which is what the
    // default (no reason) clearCart() means everywhere else it's called.
    dispatch(clearCart({ reason: 'session_reset' }));
    dispatch(clearAuth());
    dispatch(clearStore());
    // recentlyViewed isn't in persistConfig's whitelist (see that slice's
    // own header comment), so it was never written to localStorage — but
    // it's still a live, in-memory Redux slice, and nothing else clears it
    // on logout. clearCart() resets cart via the 'cart/clearCart' action
    // type, which recentlyViewedMiddleware doesn't listen for (only
    // 'cart/attachCustomer'/'cart/detachCustomer' do) — so on a shared
    // terminal, a new agent signing in right after — without a full page
    // reload — could see the PREVIOUS customer's recently-viewed carousel
    // until a fresh attach/detach cycle overwrote it.
    dispatch(clearRecentlyViewed());
    // Same reasoning as clearRecentlyViewed — wishlist isn't in
    // persistConfig's whitelist either, and wishlistMiddleware only listens
    // for cart/attachCustomer/detachCustomer, not cart/clearCart.
    dispatch(clearWishlist());
    // No separate dispatch(clearAbandonedCartState()) needed here, unlike
    // recentlyViewed above — abandonedCartMiddleware's own cart/clearCart
    // case (triggered by the 'session_reset' dispatch above) already resets
    // this slice unconditionally, regardless of the reason. It only decided
    // whether to SAVE or DELETE the Mongo record based on that reason; the
    // local Redux reset happens either way.
    // Any cookie the backend may have set (e.g. a load-balancer/session
    // cookie) must not outlive the session it belongs to.
    clearAllCookies();
    // The dispatches above wipe Redux (and, for the persisted slices, their
    // localStorage mirror) by resetting each slice back to its initial
    // state — but that still WRITES an (empty) object to localStorage
    // rather than removing the entry outright. persistor.purge() is
    // redux-persist's own API for actually deleting the persisted entry,
    // which is what "cleared entirely" should mean on a full sign-out —
    // belt-and-braces alongside the resets above, not a replacement for
    // them (the resets still matter for the in-memory state other
    // components are already subscribed to).
    persistor.purge();
    // dispatch(clearCart()) is caught by analyticsMiddleware's own
    // 'cart/clearCart' case, which calls tracker.track(EVENTS.CART_CLEARED),
    // and track() unconditionally re-writes sessionStorage's events key —
    // so clearing the tracker AFTER every dispatch that could trigger a
    // tracked event, not before, is what actually leaves it empty.
    tracker.clear();
    // TanStack Query's cache is a separate, module-level singleton (see
    // lib/queryClient.js) that nothing above ever clears on logout. On a
    // shared terminal, a different agent logging in right after — without
    // a full page reload — would inherit every previously-cached query
    // still sitting in memory: schemes list, payment modes, sales persons,
    // financial year/document config, catalog prices, etc. Several of
    // those aren't even keyed by store id, so they wouldn't self-correct
    // just because the new agent picks a different store. Clearing here
    // guarantees the next agent starts from a genuinely empty cache.
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
