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

  logoutFromOrnaverse().catch(() => {});
  store.dispatch(clearCart({ reason: 'session_reset' }));
  store.dispatch(clearAuth());
  store.dispatch(clearStore());
  store.dispatch(clearRecentlyViewed());
  store.dispatch(clearWishlist());
  clearAllCookies();
  persistor.purge();
  tracker.clear();
  toast.error('Your session has expired. Please log in again — check Orders/Invoices for anything you were just placing.');
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

const extractServerMessage = (data) => {
  if (!data) return null;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return null;
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
 *
 * @param {import('axios').AxiosError} error
 * @returns {{ code: number, message: string, details: string|null,
 *             retryable: boolean, serverMessage: string|null, response?: object }}
 */
const normalizeError = (error) => {
  if (error.response && process.env.NODE_ENV !== 'production') {
    // A 4xx here is very often an expected, already-handled business
    // response (a declined promo, a stock conflict, etc.) — callers up the
    // stack routinely catch and surface these gracefully. Logging every one
    // as a red console.error made the console look broken even when nothing
    // was; reserving console.error for 5xx (a genuine server-side failure)
    // keeps the signal for things actually worth alarm.
    const log = error.response.status >= 500 ? console.error : console.warn;
    log(
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
