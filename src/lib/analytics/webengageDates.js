// src/lib/analytics/webengageDates.js
//
// The ONE place that formats a date for WebEngage — every event's
// event_datetime/event_date/event_time (and any future date-typed
// attribute, e.g. appointment_datetime) must go through these functions,
// nowhere else. WebEngage has no date-only/time-only attribute type, only a
// full-timestamp Date type, so "date-only" and "time-only" semantics here
// are approximated (00:00:00 for date-only, a plain "HH:mm" string — not a
// WebEngage Date attribute — for display-only time).
//
// Store timezone is fixed at IST (+05:30) — this tenant has no stores
// outside India today. If that changes, this file is the only place that
// needs a per-store offset added.
//
// OPEN QUESTION (flagged, not guessed): whether WebEngage's REST Track Event
// endpoint needs a "~t" (or similar) type-hint prefix on date-string values
// in eventData, the way some other CDPs require. Not applied here — every
// value below is a plain ISO-ish string. If dates don't parse as Date type
// in the WebEngage panel after testing, THIS is the one function
// (applyDateTypeHint) to change; nothing else references date formatting.

const OFFSET_MINUTES = 330; // +05:30, IST
const OFFSET_SUFFIX = '+0530';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toIstParts(date) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + OFFSET_MINUTES * 60000);
  return {
    year: ist.getFullYear(),
    month: ist.getMonth() + 1,
    day: ist.getDate(),
    hours: ist.getHours(),
    minutes: ist.getMinutes(),
    seconds: ist.getSeconds(),
  };
}

// See "OPEN QUESTION" above — the one spot to add a prefix if WebEngage
// turns out to need one for date-typed eventData values.
function applyDateTypeHint(isoLike) {
  return isoLike;
}

/** Full timestamp — yyyy-MM-ddTHH:mm:ss+0530. Use for event_datetime, and
 *  for any other genuinely-timestamped attribute (e.g. appointment_datetime). */
export function formatWebEngageDateTime(date = new Date()) {
  const p = toIstParts(date);
  return applyDateTypeHint(
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}${OFFSET_SUFFIX}`,
  );
}

/** Same day, floored to 00:00:00 — WebEngage's closest equivalent to a
 *  date-only value. Use for event_date. */
export function formatWebEngageDateOnly(date = new Date()) {
  const p = toIstParts(date);
  return applyDateTypeHint(`${p.year}-${pad(p.month)}-${pad(p.day)}T00:00:00${OFFSET_SUFFIX}`);
}

/** "HH:mm" — display-only string, NOT a WebEngage Date attribute. Use for
 *  event_time. */
export function formatWebEngageTimeOnly(date = new Date()) {
  const p = toIstParts(date);
  return `${pad(p.hours)}:${pad(p.minutes)}`;
}
