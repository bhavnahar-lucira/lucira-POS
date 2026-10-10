'use client';

import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';

import { selectCheckoutInProgress } from '@/store/slices/uiSlice';

/**
 * Registers the offline-support + auto-update service worker (public/sw.js
 * — see its header for the full design). Mounted at the true app root
 * (src/app/layout.js), NOT inside the (pos) layout's SessionProvider/
 * AuthGuard, so it still registers on /login and /store-selection — an
 * unauthenticated tab should still get the offline fallback and pick up
 * updates.
 *
 * A new worker never takes over on its own: we only hand it control once
 * checkoutInProgress (uiSlice) is false, so a deploy never yanks the page
 * away from an operator mid-payment.
 */
export default function ServiceWorkerRegistration() {
  const checkoutInProgress = useSelector(selectCheckoutInProgress);
  const checkoutInProgressRef = useRef(checkoutInProgress);
  useEffect(() => { checkoutInProgressRef.current = checkoutInProgress; }, [checkoutInProgress]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      // Give the operator a moment to actually read this before the reload
      // wipes it — firing both on the same tick showed nothing but a flash.
      toast.info('Updating to the latest version…', { id: 'app-update' });
      setTimeout(() => window.location.reload(), 1200);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const activateWhenSafe = (worker) => {
      if (!checkoutInProgressRef.current) {
        worker.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
      // Mid-sale — defer, but say so once, so a cashier who notices nothing
      // happened doesn't report this as a glitch.
      toast.info('A new version is ready and will apply once this sale is complete.', {
        id: 'app-update',
        duration: 8000,
      });
      const interval = setInterval(() => {
        if (!checkoutInProgressRef.current) {
          clearInterval(interval);
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      }, 2000);
    };

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // A worker may already be sitting in `waiting` from a deploy that
      // happened while this tab was closed — same safe handoff applies.
      if (registration.waiting) activateWhenSafe(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            activateWhenSafe(newWorker);
          }
        });
      });
    }).catch((err) => console.warn('[ServiceWorker] registration failed', err));

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}
