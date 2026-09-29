// src/lib/analytics/phoneFormat.js
//
// Shared by tracker.js (client — builds the WebEngage userId from a
// customer's mobile) and webengageServer.js (server — formats the `phone`
// profile attribute). Pure logic, no secrets — safe on both sides.
//
// India-only assumption — a bare 10-digit local number is normalized to
// E.164 with a +91 country code (WebEngage's `phone` field, and our own
// choice of WebEngage userId, both expect E.164). Revisit if Lucira ever
// takes an international customer's number.
export function toE164India(mobile) {
  if (!mobile) return null;
  const digits = String(mobile).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}
