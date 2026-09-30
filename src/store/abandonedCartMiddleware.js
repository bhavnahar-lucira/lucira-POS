// src/store/abandonedCartMiddleware.js
//
// All the async side-effects for the abandoned-cart feature live here, not
// in components or in the slice — same split as analyticsMiddleware.js /
// recentlyViewedMiddleware.js and for the same reason: cart mutations and
// attach/detach are dispatched from more than one call site, so catching
// them at the action level guarantees this fires exactly once regardless
// of which component triggered it.
//
// FOUR responsibilities:
//
//   1. cart/attachCustomer — fetch this customer's saved abandoned cart
//      from Mongo. Three outcomes:
//        a. The live cart is EMPTY and they have a saved one → restore it
//           straight into the cart (cartSlice.restoreCart) and toast the
//           operator so it's not a silent surprise.
//        b. The live cart is NOT empty AND they have a saved one — a guest/
//           walk-in basket built up before this customer was picked, or a
//           re-attach of the same already-attached customer — MERGE the two
//           item lists (mergeCartItems below) rather than either replacing
//           the live cart or discarding the saved one. FIXED 2026-09-30:
//           this used to always pick the live cart and never even look at
//           the saved one in this branch, so a customer's real saved
//           abandoned cart silently vanished the moment they were attached
//           to any cart that already had something in it.
//        c. The live cart is NOT empty and nothing is saved — this is the
//           re-attaching-the-same-already-attached-customer case (removed
//           2026-09-03: CustomerSessionSheet/customers page used to offer a
//           "Keep Cart" choice that carried a DIFFERENT customer's items
//           into this one; both now always detach — see #3 — before
//           attaching, so a switch never reaches this branch with someone
//           else's items) → save the cart under THEIR party_id right away
//           rather than waiting for the next add/remove to trigger a save.
//
//   2. Any cart-mutating action (add/remove/qty/promo/gift card/voucher/
//      fulfillment-hydrate) while a customer is attached → debounced save
//      of the current cart snapshot to Mongo. Debounced so tapping +/- on
//      quantity five times doesn't fire five network calls.
//
//   3. cart/detachCustomer — always fires on a customer switch now (see #1),
//      not just an explicit "Remove" tap. Snapshot the outgoing customer's
//      items under THEIR OWN party_id before that history has any chance of
//      being silently overwritten by whatever uses this cart next (the
//      incoming customer's attach, a new guest sale). Reads the PRE-action
//      state, not post — by the time this case runs, the reducer has
//      already nulled cart.customerId.
//
//   4. cart/clearCart — the explicit "Clear Cart" button (see
//      CustomerSessionSheet), or useAuth.js's logout() (reason:
//      'session_reset', handled differently — see that case's own
//      comment). Either way the cart is no longer pending, so (outside the
//      logout case) delete whatever was saved — there's nothing left to
//      call abandoned. Also reads pre-action state for the same reason as
//      #3.
//
//   5. cart/clearCartKeepCustomer (added 2026-09-07) — fires after a
//      COMPLETED SALE (see checkout/page.jsx) instead of cart/clearCart,
//      specifically so cartSlice's own reducer keeps the customer attached
//      post-sale. Same "delete the saved record, the cart is resolved"
//      handling as cart/clearCart's default branch — this is a
//      customer-attachment distinction only, not a different cart-resolved
//      outcome.

import { toast } from 'react-toastify';
import { setAbandonedCart, clearAbandonedCartState } from './slices/abandonedCartSlice';
import { restoreCart } from './slices/cartSlice';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

const SAVE_DEBOUNCE_MS = 1500;
let saveTimer = null;

// Same identity keys cartSlice's own addItem/removeItem match a line on.
// Matching lines SUM quantities (mirrors addItem's own re-add behavior);
// anything else is just kept. Reported directly (2026-09-30): attaching a
// customer to a cart that already had items (a guest/walk-in basket built
// up before picking who it's for, or re-attaching the same customer)
// REPLACED those items outright with whatever that customer's saved
// abandoned cart held — real, unsaved-yet items the operator had just
// added were silently gone. This is what closes that — both item lists
// survive, combined, instead of one winning outright.
function mergeCartItems(existingItems, incomingItems) {
  const merged = existingItems.map((item) => ({ ...item }));
  for (const incoming of incomingItems) {
    const match = merged.find((item) =>
      item.itemId  === incoming.itemId &&
      item.sizeId  === incoming.sizeId &&
      item.styleId === incoming.styleId
    );
    if (match) {
      match.quantity = (match.quantity ?? 1) + (incoming.quantity ?? 1);
    } else {
      merged.push({ ...incoming });
    }
  }
  return merged;
}

const MUTATING_TYPES = new Set([
  'cart/addItem',
  'cart/removeItem',
  'cart/updateQuantity',
  'cart/applyPromo',
  'cart/removePromo',
  'cart/hydrateFromOrder',
]);

// FIXED 2026-09-09 — customerMobile threaded through every call in this
// file (fetch/save/delete) alongside party_id. See lib/mongo/
// normalizeMobile.js's header for the root cause this closes: party_id is
// assigned per OrnaVerse TENANT, so the "same" customer resolves to a
// DIFFERENT party_id under UAT vs LIVE — a cart saved under one environment
// silently stopped restoring after switching to the other. save() already
// sent customerMobile in its POST body (untouched below); fetch/delete now
// send it as a query param too, since GET/DELETE have no body.
function buildQuery(partyId, customerMobile) {
  const params = new URLSearchParams();
  if (partyId != null) params.set('party_id', String(partyId));
  if (customerMobile) params.set('customer_mobile', customerMobile);
  return params.toString();
}

// Same-origin calls throughout this file — the operator's session cookie
// rides along automatically; the route itself rejects if no one's signed in.
async function fetchAbandonedCart(partyId, customerMobile) {
  try {
    const res = await fetch(`/api/customers/abandoned-cart?${buildQuery(partyId, customerMobile)}`);
    // FIXED 2026-09-09 — same blind spot as saveAbandonedCart's own comment:
    // a non-2xx response was silently treated as "nothing saved" with zero
    // trace of WHY. Now at least visible if it happens again.
    if (!res.ok) {
      console.warn('[abandonedCartMiddleware] fetch REJECTED by server', res.status);
      return null;
    }
    const data = await res.json();
    return data?.cart ?? null;
  } catch (err) {
    console.warn('[abandonedCartMiddleware] fetch failed (network)', err);
    return null;
  }
}

function saveAbandonedCart(partyId, cart, companyId) {
  // FIXED 2026-09-09 — this used to be .catch()-only, so a server-side
  // REJECTION (400/500 — a real HTTP response, not a network failure) was
  // completely silent: fetch() only rejects its promise on a network-level
  // failure, never on a non-2xx status, so a bad request or a Mongo error
  // on the server side produced zero trace anywhere. Investigated live
  // 2026-09-09 (reported: cart abandoned-restore not working after
  // logout/login, while recently-viewed/wishlist — which happen to hit
  // this exact blind spot far less often — worked) by checking Mongo
  // directly: confirmed writes were happening for recently-viewed/wishlist
  // but NOT for abandoned-cart in the same session, with nothing in any
  // log to say why. This makes the next occurrence visible instead of
  // silent — if this warns, the request reached the server and was
  // rejected (check the logged status/body); if NOTHING warns at all, the
  // fetch was never even attempted (a client-side issue upstream of this
  // function — the debounce timer's own guard, or this action never firing).
  fetch('/api/customers/abandoned-cart', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      party_id:       partyId,
      customerName:   cart.customerName,
      customerMobile: cart.customerMobile,
      items:          cart.items,
      subtotal:       cart.subtotal,
      taxAmount:      cart.taxAmount,
      total:          cart.total,
      // Store active at save time (2026-08-27) — so the record carries
      // which store it belongs to instead of that being lost. See
      // storeSlice's activeStoreId, the same value every other feature
      // scopes by.
      company_id:     companyId ?? null,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn('[abandonedCartMiddleware] save REJECTED by server', res.status, body);
      }
    })
    .catch((err) => console.warn('[abandonedCartMiddleware] save failed (network)', err));

  // ADDED 2026-09-08 — GA4/WebEngage tracking for whatever just got saved
  // to Mongo above, same call every "cart saved as abandoned" path already
  // funnels through (see this file's own header's 4 responsibilities), so
  // this fires exactly once per real save, not a separate guess at when a
  // cart "counts" as abandoned. Items carry their full `attributes` (see
  // AddToCartButton.jsx/productAttributes.js) — the same rich product
  // detail every other cart/product event now has, not just item_id/name.
  tracker.track(EVENTS.CART_ABANDONED, {
    store_id:   companyId ?? null,
    item_count: cart.items.length,
    subtotal:   cart.subtotal ?? null,
    tax_amount: cart.taxAmount ?? null,
    total:      cart.total ?? null,
    currency:   'INR',
  }, {
    customer_id:     partyId,
    customer_name:   cart.customerName,
    customer_mobile: cart.customerMobile,
    items: cart.items.map((item) => ({
      item_id:    item.itemId,
      item_name:  item.itemName,
      item_sku:   item.sku,
      quantity:   item.quantity,
      unit_price: item.unitPrice,
      image:      item.image,
      product_url: item.productUrl,
      ...item.attributes,
    })),
  });
}

function deleteAbandonedCart(partyId, customerMobile) {
  fetch(`/api/customers/abandoned-cart?${buildQuery(partyId, customerMobile)}`, {
    method:  'DELETE',
  }).catch((err) => console.warn('[abandonedCartMiddleware] delete failed', err));
}

export const abandonedCartMiddleware = (store) => (next) => (action) => {
  // Captured BEFORE next(action) — detachCustomer/clearCart's reducers
  // already wipe customerId/items by the time we'd otherwise inspect
  // state, so the pre-action snapshot is the only place to read "what was
  // this cart, and whose was it" for those two cases.
  const preCart = store.getState().cart;

  const result = next(action);

  const state = store.getState();
  const isAuthenticated = state.auth?.isAuthenticated;
  const companyId = state.store?.activeStoreId;

  switch (action.type) {
    case 'cart/attachCustomer': {
      // FIXED 2026-09-09 — see the identical fix on detachCustomer/clearCart/
      // clearCartKeepCustomer below for the full race: a debounced save
      // timer scheduled under the OUTGOING customer (or no customer at all)
      // could still be pending when a new customer attaches. Cancelled here
      // too so no leftover timer from a previous session/customer can fire
      // once this one is underway.
      clearTimeout(saveTimer);
      saveTimer = null;

      const { customerId, customerMobile } = action.payload;
      if (!customerId || !isAuthenticated) break;

      fetchAbandonedCart(customerId, customerMobile).then((record) => {
        const hasSaved = record && Array.isArray(record.items) && record.items.length > 0;
        store.dispatch(setAbandonedCart(hasSaved ? record : null));

        const freshCart = store.getState().cart;
        // Customer may have detached again before this promise resolved —
        // don't act on stale data for whoever's attached now.
        if (freshCart.customerId !== customerId) return;

        if (freshCart.items.length > 0 && hasSaved) {
          // Both a live cart (a guest/walk-in basket built up before this
          // customer was picked, or a re-attach of the same customer who
          // already had items) AND a saved abandoned cart for them — MERGE
          // rather than picking one, so neither silently disappears.
          const merged = mergeCartItems(freshCart.items, record.items);
          store.dispatch(restoreCart({ items: merged }));
          saveAbandonedCart(customerId, { ...freshCart, items: merged }, store.getState().store?.activeStoreId);
          toast.success(
            `Merged ${record.items.length} item${record.items.length === 1 ? '' : 's'} from a previous cart into this one`
          );
        } else if (freshCart.items.length > 0) {
          // Items already in the cart at attach time, nothing saved to
          // merge in — this customer was already attached and had items
          // (re-attach, not a switch: a switch always detaches first — see
          // 'cart/detachCustomer' — so the cart is empty by the time a
          // DIFFERENT customer attaches).
          saveAbandonedCart(customerId, freshCart, store.getState().store?.activeStoreId);
        } else if (hasSaved) {
          store.dispatch(restoreCart({ items: record.items }));
          toast.success(
            `Restored ${record.items.length} item${record.items.length === 1 ? '' : 's'} from a previous cart`
          );
        }
      });
      break;
    }

    case 'cart/detachCustomer': {
      // FIXED 2026-09-09 — a debounced save from an earlier mutating action
      // (default case below) could still be pending when detach fires.
      // Without cancelling it, a quick detach-then-reattach of the SAME
      // customer let that stale timer fire AFTER this save + reset had
      // already run: it reads latestCart fresh at fire time, sees the same
      // customerId attached again (matches!) with an empty cart (a fresh
      // attach starts empty), and calls deleteAbandonedCart — wiping out
      // the record this very case just saved, racing whatever attach's own
      // restore fetch was doing. Cancelling here means this save is always
      // the last word for this customer until a genuinely new mutation
      // schedules its own timer.
      clearTimeout(saveTimer);
      saveTimer = null;

      if (preCart.customerId && preCart.items.length > 0 && isAuthenticated) {
        saveAbandonedCart(preCart.customerId, preCart, companyId);
      }
      store.dispatch(clearAbandonedCartState());
      break;
    }

    case 'cart/clearCart': {
      // Same reasoning as detachCustomer above — a stale pending timer
      // must not outlive an explicit clear/logout.
      clearTimeout(saveTimer);
      saveTimer = null;

      // reason: 'session_reset' (2026-08-22) — useAuth.js's logout() also
      // dispatches clearCart() to wipe the OPERATOR's local session; that
      // has nothing to do with whether the CUSTOMER's cart was ever
      // resolved. Without this distinction, an operator signing out while
      // a customer had an unpaid cart would delete that customer's saved
      // cart outright — exactly backwards, since an unresolved cart at
      // logout is precisely what "abandoned" means and should be
      // preserved, not discarded. Every other clearCart() caller (the
      // explicit "Clear Cart" button in CustomerSessionSheet) means the
      // cart really is resolved, so the default (no reason) behavior stays
      // "delete". (A completed sale in checkout/page.jsx dispatches
      // 'cart/clearCartKeepCustomer' instead, below — not this action.)
      if (preCart.customerId && isAuthenticated) {
        if (action.payload?.reason === 'session_reset') {
          if (preCart.items.length > 0) saveAbandonedCart(preCart.customerId, preCart, companyId);
        } else {
          deleteAbandonedCart(preCart.customerId, preCart.customerMobile);
        }
      }
      store.dispatch(clearAbandonedCartState());
      break;
    }

    // ADDED 2026-09-07, alongside cartSlice's own clearCartKeepCustomer —
    // checkout/page.jsx now dispatches THIS (not cart/clearCart) after a
    // completed sale, specifically so the reducer keeps the customer
    // attached. That's a cart-state distinction only — it doesn't change
    // whether the cart itself was resolved: a completed sale always means
    // "delete the saved abandoned-cart record," same as cart/clearCart's
    // own default (no-reason) branch above, never a "session_reset"-style
    // save. If this customer adds new items afterward (same attach,
    // now-empty cart), the debounced save in the default case below starts
    // a fresh record for them, same as any other cart activity.
    case 'cart/clearCartKeepCustomer': {
      // Same reasoning as detachCustomer above — the customer STAYS
      // attached here (post-sale), so a stale timer from just-before-
      // checkout firing afterward would match customerId again and could
      // delete a fresh save from new items the customer starts adding
      // right after the sale completes.
      clearTimeout(saveTimer);
      saveTimer = null;

      if (preCart.customerId && isAuthenticated) deleteAbandonedCart(preCart.customerId, preCart.customerMobile);
      store.dispatch(clearAbandonedCartState());
      break;
    }

    default: {
      if (MUTATING_TYPES.has(action.type)) {
        const { customerId, customerMobile } = state.cart;
        if (!customerId || !isAuthenticated) break;

        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const latestCart = store.getState().cart;
          if (latestCart.customerId !== customerId) return; // attached customer changed mid-debounce
          if (latestCart.items.length === 0) {
            deleteAbandonedCart(customerId, customerMobile);
          } else {
            saveAbandonedCart(customerId, latestCart, store.getState().store?.activeStoreId);
          }
        }, SAVE_DEBOUNCE_MS);
      }
    }
  }

  return result;
};
