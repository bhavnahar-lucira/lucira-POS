// When a posted invoice can still be insured with Olocker.
//
// Pure and timezone-explicit so the browser (to disable the button) and
// the API route (to refuse the request) reach the same answer: the route
// may run in UTC while every store and every invoice date is in IST.

import { INSURANCE_WINDOW_DAYS } from './constants';

const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+5:30
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) of an instant, as seen in IST. */
function istDateOf(date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The invoice's purchase date as an IST calendar date.
 *
 * OrnaVerse returns `document_date` as a zone-less local timestamp
 * ("2026-11-02T10:37:00"), which is already the IST date and is read as-is.
 * A value carrying an explicit zone ("…Z", "+05:30") or a Date is converted
 * to IST first.
 *
 * @param {string|Date|null|undefined} value
 * @returns {string|null} YYYY-MM-DD, or null when unparseable
 */
export function purchaseDateIST(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : istDateOf(value);
  }
  const text = String(value).trim();
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate && !hasZone) return isoDate[1];

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : istDateOf(parsed);
}

/** Whole calendar days between two YYYY-MM-DD strings (b − a). */
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * @param {string|Date|null|undefined} documentDate — the invoice's document_date
 * @param {Date} [now]
 * @returns {{
 *   isOpen: boolean,          // a policy may still be generated
 *   lastDay: string|null,     // YYYY-MM-DD, final day insurance is allowed
 *   daysLeft: number|null,    // 0 on the last day; negative once closed
 * }}
 */
export function getInsuranceWindow(documentDate, now = new Date()) {
  const purchased = purchaseDateIST(documentDate);
  // No usable date: fail closed. Olocker needs inv_dt anyway, and guessing
  // here could issue a policy outside the insurer's window.
  if (!purchased) return { isOpen: false, lastDay: null, daysLeft: null };

  const lastDay = new Date(Date.parse(`${purchased}T00:00:00Z`) + INSURANCE_WINDOW_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const daysLeft = daysBetween(istDateOf(now), lastDay);

  return { isOpen: daysLeft >= 0, lastDay, daysLeft };
}

/** "9 Nov 2026" for a YYYY-MM-DD string, without any timezone shift. */
export function formatWindowDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}
