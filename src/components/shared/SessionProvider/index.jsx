'use client';

// Runs two independent idle timers off the same activity events:
// - Customer idle timer (active while a customer is attached) detaches the
//   customer + clears the cart and redirects to /dashboard — does NOT log
//   out the agent.
// - Staff idle timer (active whenever the agent is authenticated) fully
//   logs the agent out via useAuth().logout().
// Also tracks page views and clicks while the agent is authenticated.

import { useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { selectCartCustomerId, selectCartCustomerName }  from '@/store/slices/cartSlice';
import { selectIsAuthenticated, selectAuthUser } from '@/store/slices/authSlice';
import { selectActiveStoreId, selectActiveStoreName } from '@/store/slices/storeSlice';
import { detachCustomer, clearCart } from '@/store/slices/cartSlice';
import { useAuth } from '@/hooks/auth/useAuth';

import tracker from '@/lib/analytics/tracker';
import EVENTS  from '@/lib/analytics/events';
import { getPageType } from '@/lib/analytics/pageType';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

// A bare item id in a /products/:id path isn't memorable in a console/report
// (reported directly) — pull the product's own name/sku off whatever
// useProductDetail(itemId) already has cached (react-query, same query key),
// no extra fetch. Returns {} off a product page or before that query has
// resolved — CLICK still fires either way, just without these extra fields.
const PRODUCT_PATH_RE = /^\/products\/(\d+)/;
function readCachedProductContext(queryClient, pathname) {
  const match = pathname?.match(PRODUCT_PATH_RE);
  if (!match) return {};
  const itemId = Number(match[1]);
  const item = queryClient.getQueryData(QUERY_KEYS.ITEMS.DETAIL(itemId))?.data?.Entity;
  if (!item) return { product_id: itemId };
  return {
    product_id:   item.item_id ?? itemId,
    product_name: item.item_name ?? null,
    product_sku:  item.item_code ?? null,
    product_category: item.type_name ?? null,
  };
}

const ACTIVITY_EVENTS = [
  'mousedown', 'mousemove', 'keydown',
  'scroll', 'touchstart', 'pointerdown', 'click',
];

// Every click across the whole app funnels through ONE handler below, so
// WebEngage's own event_type came back as a flat "click" no matter what was
// actually tapped (reported directly — "I clicked catalog, event_type was
// just Click"). Derives a specific, readable event_type from whatever label
// the clicked element actually has — "Catalog" -> "catalog_clicked" — same
// lowercase_with_underscores convention webengageServer.js's toEventType()
// uses for every other event (explicit direction, 2026-09-29), so this
// reads consistently next to them in the WebEngage panel. Passed as an
// explicit `event_type` property (see track() below), which OVERRIDES the
// generic one toEventType() would otherwise derive from the shared
// EVENTS.CLICK name — GA4 is unaffected, it still gets the one stable
// "POS_click" event name either way, just with this as an extra parameter.
function deriveClickEventType(label) {
  const words = String(label ?? '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6); // keep it readable — a long button sentence doesn't need to survive whole
  if (!words.length) return 'element_clicked';
  return `${words.join('_')}_clicked`;
}

export default function SessionProvider({ children }) {
  const pathname        = usePathname();
  const router          = useRouter();
  const dispatch        = useDispatch();
  const queryClient     = useQueryClient();
  const { logout }      = useAuth();

  const isAuthenticated = useSelector(selectIsAuthenticated);
  const authUser        = useSelector(selectAuthUser);
  const customerId      = useSelector(selectCartCustomerId);
  const customerName    = useSelector(selectCartCustomerName);
  const activeStoreId   = useSelector(selectActiveStoreId);
  const activeStoreName = useSelector(selectActiveStoreName);
  const isCustomerActive = isAuthenticated && !!customerId;

  const idleTimerRef      = useRef(null);
  const warningTimerRef    = useRef(null);
  const staffIdleTimerRef  = useRef(null);
  const staffWarningTimerRef = useRef(null);
  const lastPathRef       = useRef(null);

  const clearIdleTimers = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(warningTimerRef.current);
    idleTimerRef.current    = null;
    warningTimerRef.current = null;
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (!isCustomerActive) return;
    clearIdleTimers();

    warningTimerRef.current = setTimeout(() => {
      toast.warning('Customer session expiring in 30 seconds due to inactivity.', {
        duration: 10000,
        id:       'idle-warning',
      });
    }, APP_CONFIG.SESSION.IDLE_TIMEOUT_MS - APP_CONFIG.SESSION.WARNING_BEFORE);

    idleTimerRef.current = setTimeout(() => {
      toast.dismiss('idle-warning');
      tracker.endSession('idle_timeout');
      dispatch(detachCustomer());
      dispatch(clearCart());
      toast.info('Customer session expired due to inactivity.', {
        id: 'idle-expired',
      });
      router.replace('/dashboard');
    }, APP_CONFIG.SESSION.IDLE_TIMEOUT_MS);
  }, [isCustomerActive, clearIdleTimers, dispatch, router]);

  // Start/stop customer idle timer based on customer presence
  useEffect(() => {
    if (!isCustomerActive) {
      clearIdleTimers();
      return;
    }

    resetIdleTimer();

    const handleActivity = () => resetIdleTimer();
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, handleActivity, { passive: true })
    );

    return () => {
      clearIdleTimers();
      ACTIVITY_EVENTS.forEach((e) =>
        window.removeEventListener(e, handleActivity)
      );
    };
  }, [isCustomerActive, resetIdleTimer, clearIdleTimers]);

  const clearStaffIdleTimers = useCallback(() => {
    clearTimeout(staffIdleTimerRef.current);
    clearTimeout(staffWarningTimerRef.current);
    staffIdleTimerRef.current    = null;
    staffWarningTimerRef.current = null;
  }, []);

  const resetStaffIdleTimer = useCallback(() => {
    if (!isAuthenticated) return;
    clearStaffIdleTimers();

    staffWarningTimerRef.current = setTimeout(() => {
      toast.warning('You will be logged out in 30 seconds due to inactivity.', {
        duration: 10000,
        id:       'staff-idle-warning',
      });
    }, APP_CONFIG.SESSION.STAFF_IDLE_TIMEOUT_MS - APP_CONFIG.SESSION.WARNING_BEFORE);

    staffIdleTimerRef.current = setTimeout(() => {
      toast.dismiss('staff-idle-warning');
      toast.info('Logged out due to inactivity.', { id: 'staff-idle-expired' });
      // trackAgent() can't auto-derive store context, so it's passed explicitly
      // here. Distinct from the AGENT_LOGOUT event logout() fires next — this
      // one records why (idle timeout) the logout is happening.
      tracker.trackAgent(EVENTS.AGENT_IDLE_LOGOUT, {
        username:  authUser?.username,
        timeoutMs: APP_CONFIG.SESSION.STAFF_IDLE_TIMEOUT_MS,
        storeId:   activeStoreId,
        storeName: activeStoreName,
      });
      logout();
    }, APP_CONFIG.SESSION.STAFF_IDLE_TIMEOUT_MS);
  }, [isAuthenticated, clearStaffIdleTimers, logout, activeStoreId, activeStoreName, authUser]);

  // Start/stop staff idle timer based on auth state
  useEffect(() => {
    if (!isAuthenticated) {
      clearStaffIdleTimers();
      return;
    }

    resetStaffIdleTimer();

    const handleActivity = () => resetStaffIdleTimer();
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, handleActivity, { passive: true })
    );

    return () => {
      clearStaffIdleTimers();
      ACTIVITY_EVENTS.forEach((e) =>
        window.removeEventListener(e, handleActivity)
      );
    };
  }, [isAuthenticated, resetStaffIdleTimer, clearStaffIdleTimers]);

  // Page view tracking runs for the full staff session (not gated on a
  // customer being attached) — tracker.track reads customer context from
  // the session when present, but doesn't require it.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;

    tracker.track(EVENTS.PAGE_VIEW, {
      path:     pathname,
      title:    typeof document !== 'undefined' ? document.title : '',
      pageType: getPageType(pathname),
    });
  }, [pathname, isAuthenticated]);

  // Reset path ref on logout so the next login gets fresh tracking
  useEffect(() => {
    if (!isAuthenticated) {
      lastPathRef.current = null;
    }
  }, [isAuthenticated]);

  // Tracks every click immediately (no debounce) — each click is a distinct
  // event that needs its own row, unlike a search box's "final value wins".
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleClick = (e) => {
      const target = e.target?.closest(
        'button, a, [role="button"], [role="menuitem"], [role="option"], [role="tab"]'
      );
      if (!target) return;

      const text = (target.textContent ?? '').trim().slice(0, 50);
      const ariaLabel = target.getAttribute('aria-label') ?? null;

      tracker.track(EVENTS.CLICK, {
        // Overrides the generic "Click" WebEngage would otherwise derive
        // from EVENTS.CLICK alone — see deriveClickEventType's own comment.
        event_type: deriveClickEventType(ariaLabel || text || target.id),
        tag:        target.tagName,
        text,
        ariaLabel,
        path:       pathname,
        id:         target.id || null,
        customerId: customerId ?? null,
        ...readCachedProductContext(queryClient, pathname),
      }, customerName ? { customer_name: customerName } : {});
    };

    document.addEventListener('click', handleClick, { passive: true, capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [isAuthenticated, pathname, queryClient, customerId, customerName]);

  return children;
}