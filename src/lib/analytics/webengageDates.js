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

export function formatWebEngageDateTime(date = new Date()) {
  const p = toIstParts(date);
  return applyDateTypeHint(
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}${OFFSET_SUFFIX}`,
  );
}

export function formatWebEngageDateOnly(date = new Date()) {
  const p = toIstParts(date);
  return applyDateTypeHint(`${p.year}-${pad(p.month)}-${pad(p.day)}T00:00:00${OFFSET_SUFFIX}`);
}

export function formatWebEngageTimeOnly(date = new Date()) {
  const p = toIstParts(date);
  return `${pad(p.hours)}:${pad(p.minutes)}`;
}
