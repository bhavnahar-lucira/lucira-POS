import APP_CONFIG from '@/constants/appConfig';

/**
 * Formats an amount as an INR currency string, or null for missing/zero/NaN
 * amounts — callers use the null to show a "not available" state instead of
 * a misleading ₹0.
 * @param {number|string|null|undefined} amount
 * @returns {string|null}
 */
export function formatPrice(amount) {
  if (amount === null || amount === undefined) return null;
  const num = parseFloat(amount);
  if (isNaN(num) || num === 0) return null;
  return new Intl.NumberFormat('en-IN', {
    style:                'currency',
    currency:             APP_CONFIG.CURRENCY.INR_CODE ?? 'INR',
    // Keep at 2 — this is a display figure only (no document round_off
    // involved), and must match the precision PriceBreakdown shows for the
    // same underlying field elsewhere on the page.
    maximumFractionDigits: 2,
  }).format(num);
}

// Shared INR amount formatters — three missing-value behaviors, matching
// every pattern found duplicated across the app (see each function's doc).

/**
 * Always shows a real amount — missing/NaN default to 0, never null/'—'.
 * Use for a running total that must always show a number (a cart total, a
 * price breakdown line) even when it's genuinely zero.
 * @param {number|string|null|undefined} amount
 * @returns {string}
 */
export function formatAmount(amount) {
  const num = Number(amount ?? 0);
  return `₹${(isNaN(num) ? 0 : num).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * Missing amount → the placeholder string '—' (for inline text/labels
 * where returning null would render as literally nothing, reading as a
 * layout gap rather than "no value").
 * @param {number|string|null|undefined} amount
 * @returns {string}
 */
export function formatAmountOrDash(amount) {
  if (amount == null) return '—';
  return formatAmount(amount);
}

/**
 * Missing amount → null (for a value handed to a row/list component that
 * itself hides when given a falsy value — returning '—' here would make
 * every such row always render instead of only the ones with real data).
 * @param {number|string|null|undefined} amount
 * @returns {string|null}
 */
export function formatAmountOrNull(amount) {
  if (amount == null) return null;
  return formatAmount(amount);
}

/**
 * Rounds to the nearest rupee using round-half-to-even ("banker's
 * rounding") — matches .NET's default Math.Round(double), which is what
 * OrnaVerse's own server uses for the net/payable total it displays.
 * JS's Math.round always rounds .50 up, which silently disagrees with
 * OrnaVerse by ₹1 on an exact-half-rupee total — confirmed live 2026-10-07:
 * a ₹79,192.50 net showed ₹79,193 here vs OrnaVerse's own ₹79,192.
 * @param {number} amount
 * @returns {number}
 */
export function roundToNearestRupee(amount) {
  const value = +amount.toFixed(2); // settle float noise before the tie check
  const floor = Math.floor(value);
  const diff  = +(value - floor).toFixed(2);
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}
