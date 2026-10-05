export function isGtagAvailable() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

/**
 * Send a single event to GA4.
 * @param {string} eventName
 * @param {object} params
 */
export function sendToGA(eventName, params = {}) {
  if (!isGtagAvailable()) return;
  try {
    window.gtag('event', eventName, params);
  } catch {
    // analytics failures must never surface to the user
  }
}
