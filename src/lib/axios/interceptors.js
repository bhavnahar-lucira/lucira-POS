// src/lib/axios/interceptors.js
// Response interceptor for the Lucira POS Axios instance.
//
// There is no request interceptor any more: every call authenticates via
// the operator's own httpOnly session cookie (see lib/ornaverse/session.js),
// which the browser attaches automatically to same-origin requests — there
// is no bearer token to attach and no refresh token to coordinate.
//
// Response interceptor:
//   — Catches 401 responses (the session cookie is missing, expired, or
//     OrnaVerse itself rejected it) and clears local auth state / redirects
//     to login. There is nothing to silently refresh — the operator's
//     password was never kept (see session.js's own header for why), so a
//     rejected session surfaces "sign in again" rather than failing
//     obscurely.

// We import the store lazily (inside functions) to avoid circular
// dependency issues between axiosInstance → interceptors → store.
const getStore = () => require('@/store').store;

/**
 * Attaches the response interceptor to the provided Axios instance.
 * Called once during axiosInstance creation.
 *
 * @param {import('axios').AxiosInstance} instance
 */
export const attachInterceptors = (instance) => {

  instance.interceptors.response.use(
    (response) => response,

    async (error) => {
      const status = error.response?.status;
      const store  = getStore();

      if (status === 401) {
        handleLogout(store);
      }

      return Promise.reject(normalizeError(error));
    }
  );
};

/**
 * Clears Redux auth/store/cart/recently-viewed/wishlist state, the query
 * cache, and the analytics tracker, then redirects to login. Called when
 * the session cookie is missing, expired, or rejected server-side — i.e.
 * the session simply ended, not something an operator chose.
 *
 * This mirrors useAuth.js's manual logout() cleanup closely (cart,
 * recentlyViewed, wishlist, persistor.purge(), tracker, query client — see
 * that function's own comments for why each one matters on a SHARED
 * terminal). A forced session-expiry logout is exactly as much a "this
 * operator's session is over" moment as a manual one — arguably more so,
 * since it can happen mid-shift with no warning.
 *
 * The reported bug this once fixed: "once the order is placed, the
 * customer logs out automatically" — root cause was a synchronous redirect
 * firing in the same tick a failed request's promise rejected, before a
 * mutation's own onError toast (or this file's own) had a chance to render.
 * Fixed by explicitly showing a toast HERE and delaying the actual
 * navigation — long enough for both toasts to render before the page tears
 * down. That race can still happen under this simpler model (a 401 mid
 * checkout's Create→Post chain), so the same delay is kept.
 *
 * @param {object} store - Redux store
 */
const handleLogout = (store) => {
  const { clearAuth }  = require('@/store/slices/authSlice');
  const { clearStore } = require('@/store/slices/storeSlice');
  const { clearCart } = require('@/store/slices/cartSlice');
  const { clearRecentlyViewed } = require('@/store/slices/recentlyViewedSlice');
  const { clearWishlist } = require('@/store/slices/wishlistSlice');
  const { clearAllCookies } = require('@/lib/cookies');
  const { persistor } = require('@/store');
  const queryClient = require('@/lib/queryClient').default;
  const tracker = require('@/lib/analytics/tracker').default;
  const { logout: logoutFromOrnaverse } = require('@/services/authService');
  const { toast } = require('sonner');

  // Best-effort — a session that's already timed out server-side may well
  // reject this too; it must never block the local cleanup below.
  logoutFromOrnaverse().catch(() => {});

  // abandonedCartMiddleware's 'cart/clearCart' case needs the session to
  // still be live to actually save the cart to Mongo before it's wiped
  // locally — dispatch() is synchronous, so this must run BEFORE
  // clearAuth()/clearStore() below, not after.
  //
  // reason: 'session_reset' — same as useAuth.js's manual logout: this is
  // the SESSION ending, not the customer's cart being resolved, so an
  // unpaid cart is preserved as abandoned rather than deleted outright
  // (see abandonedCartMiddleware's cart/clearCart case).
  store.dispatch(clearCart({ reason: 'session_reset' }));
  store.dispatch(clearAuth());
  store.dispatch(clearStore());
  store.dispatch(clearRecentlyViewed());
  store.dispatch(clearWishlist());
  // Match normal logout — don't let a stale backend cookie survive
  // a forced logout any more than a manual one.
  clearAllCookies();
  // Actually deletes the persisted localStorage entry rather than leaving
  // an empty-but-present one — see useAuth.js logout()'s own comment on
  // why the resets above aren't enough by themselves.
  persistor.purge();
  tracker.clear();
  // NOTE: queryClient.clear() is deliberately NOT called synchronously here
  // any more — it used to run before the delayed redirect below, which
  // meant a mutation's own onError (still queued for this same tick) could
  // fire against an already-cleared query client. Clearing happens right
  // before the redirect instead, after every pending toast has had its
  // chance to render.

  toast.error('Your session has expired. Please log in again — check Orders/Invoices for anything you were just placing.');

  // Redirect to login — works in both browser and Next.js context. Delayed
  // (not immediate) so a mutation's own onError — e.g. useCreateOrder's
  // "Order created (ref #X) but couldn't be finalised" — has time to reach
  // the toast container and actually be seen before the page tears down.
  //
  // Carries the current path+query as ?next= (2026-09-28, reported: an
  // OrnaVerse session expiring mid-task — e.g. while adjusting catalog
  // filters — dropped the operator back on /dashboard after re-login,
  // losing whatever they'd set up since filters/search/sort are all URL
  // state). useAuth.js's login() honors this for a single-store account.
  // Skipped when already on /login (nothing meaningful to return to).
  if (typeof window !== 'undefined') {
    const current = window.location.pathname + window.location.search;
    const next = current.startsWith('/login') ? '' : `?next=${encodeURIComponent(current)}`;
    setTimeout(() => {
      queryClient.clear();
      window.location.href = `/login${next}`;
    }, 2500);
  } else {
    queryClient.clear();
  }
};

/**
 * Pulls the human-readable reason out of an OrnaVerse error body.
 *
 * OrnaVerse is a Serenity app: it reports both field validation AND business
 * rules as `{ "Error": { "Code": "...", "Message": "..." } }` — capital E,
 * capital M. Nothing here is at `data.message`, which is what this function
 * used to look for, so EVERY OrnaVerse reason was silently dropped and the
 * operator only ever saw the generic fallback below.
 *
 * That is how failures like "21278E2 Item cost must be a valid non-negative
 * amount" and "Not enough stock of 21278E2 can not Save" reached the counter
 * as nothing more than "Failed to create invoice. Please try again." — the
 * server was saying exactly what was wrong and we were discarding it.
 *
 * These messages are written for a shop operator, not a developer ("Not
 * enough stock of <sku>"), so showing them is the correct behaviour, not a
 * debug leak.
 */
const extractServerMessage = (data) => {
  if (!data) return null;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return null;
    // An intermediary fronting the upstream (nginx/a load balancer/CDN) can
    // return an HTML error page under load instead of OrnaVerse's own JSON
    // body — this codebase's own history includes exactly that failure
    // mode (see api/[...path]/route.js's header). Axios can't parse that as
    // JSON, so it fell back to this raw string, which used to be shown
    // verbatim — a raw HTML page dumped into a toast instead of a sensible
    // message. A genuine OrnaVerse plain-text reason never looks like
    // markup, so anything tag-shaped is untrustworthy here; return null and
    // let the generic status-based fallback below take over instead.
    if (/^<(!doctype|html|\?xml)/i.test(trimmed) || /<\/?html[\s>]/i.test(trimmed)) return null;
    return trimmed;
  }
  return (
    data.Error?.Message ??      // Serenity business rule / validation
    data.error_description ??   // this app's own auth/session routes
    data.Message ??             // bare ASP.NET fault
    data.message ??             // generic JSON API
    null
  );
};

/**
 * Converts any Axios error into a consistent normalized shape.
 * Raw API errors never reach the UI — components receive this object.
 *
 * `serverMessage` carries OrnaVerse's own reason when it sent one, so callers
 * can show the actual cause instead of a generic retry prompt. `response` is
 * passed through deliberately: callers already reach for
 * `error.response.data.Error.Message`, and stripping it made those reads
 * silently undefined.
 *
 * @param {import('axios').AxiosError} error
 * @returns {{ code: number, message: string, details: string|null,
 *             retryable: boolean, serverMessage: string|null, response?: object }}
 */
const normalizeError = (error) => {
  // DEV-ONLY DEBUG — logs the ACTUAL raw response body from OrnaVerse,
  // which normalizeError below normally discards in favor of a generic
  // user-facing message. Gated to development only — production would print
  // full upstream response bodies (which can carry customer/invoice PII on
  // business-data endpoints) to the browser console on every failed
  // request, a real leak path if anyone screen-shares or screen-records a
  // support session.
  if (error.response && process.env.NODE_ENV !== 'production') {
    console.error(
      '[normalizeError] RAW error response:',
      error.config?.url,
      error.response.status,
      JSON.stringify(error.response.data, null, 2)
    );
  }

  if (!error.response) {
    return {
      code:          0,
      message:       'Network error. Please check your connection.',
      details:       error.message ?? null,
      retryable:     true,
      serverMessage: null,
    };
  }

  const { status, data } = error.response;
  const serverMessage = extractServerMessage(data);

  // Session/permission problems are about the session, not the payload — the
  // server's wording there ("invalid_grant") is worse than ours, so those two
  // keep the fixed copy. Everywhere else OrnaVerse's own reason wins.
  const errorMap = {
    400: { message: serverMessage ?? 'Invalid request. Please check your inputs.',    retryable: false },
    401: { message: 'Your session has expired. Please log in again.',                 retryable: false },
    403: { message: 'You do not have permission to perform this action.',             retryable: false },
    404: { message: serverMessage ?? 'The requested resource was not found.',         retryable: false },
    422: { message: serverMessage ?? 'Validation failed. Please check your inputs.',  retryable: false },
    429: { message: 'Too many requests. Please wait a moment and try again.',         retryable: true  },
  };

  const mapped = errorMap[status];

  if (mapped) {
    return {
      code: status, details: serverMessage, serverMessage,
      response: error.response, ...mapped,
    };
  }

  // 5xx — OrnaVerse returns business-rule rejections as 500 with a real
  // reason in the body ("Not enough stock of <sku> can not Save"), so prefer
  // it over the generic retry prompt. A 500 with no body stays retryable;
  // one that named a cause is a rejection, not a blip, and retrying it
  // unchanged will fail identically.
  if (status >= 500) {
    return {
      code:          status,
      message:       serverMessage ?? 'Server error. Please try again in a moment.',
      details:       serverMessage,
      retryable:     !serverMessage,
      serverMessage,
      response:      error.response,
    };
  }

  return {
    code:          status,
    message:       serverMessage ?? 'Something went wrong. Please try again.',
    details:       serverMessage,
    retryable:     true,
    serverMessage,
    response:      error.response,
  };
};
