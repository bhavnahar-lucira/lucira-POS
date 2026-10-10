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

function applyDateTypeHint(isoLike) {
  return isoLike;
}

// WebEngage's own reserved top-level `eventTime` field (sendServerEventToWebEngage's
// request body) — this is the ONE WebEngage itself parses for real event
// ordering/delivery, so it stays in strict ISO 8601 + offset. Never repurpose
// this for display — see formatEventDate12h/formatEventTime12h/
// formatEventDateTime12h below for the human-readable eventData attributes.
export function formatWebEngageDateTime(date = new Date()) {
  const p = toIstParts(date);
  return applyDateTypeHint(
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}${OFFSET_SUFFIX}`,
  );
}

function to12Hour(hours) {
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return { h12, period };
}

// dd/mm/yyyy — the eventData.event_date attribute (display only; the real
// ordering field is formatWebEngageDateTime's eventTime above).
export function formatEventDate12h(date = new Date()) {
  const p = toIstParts(date);
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

// 12-hour clock with AM/PM — the eventData.event_time attribute.
export function formatEventTime12h(date = new Date()) {
  const p = toIstParts(date);
  const { h12, period } = to12Hour(p.hours);
  return `${pad(h12)}:${pad(p.minutes)} ${period}`;
}

// The eventData.event_datetime attribute — explicitly the combination of
// the two above, per direction (2026-10-09), not a third independent format.
export function formatEventDateTime12h(date = new Date()) {
  return `${formatEventDate12h(date)} ${formatEventTime12h(date)}`;
}
