import { parsePhoneNumberFromString } from 'libphonenumber-js';

// OrnaVerse stores Indian numbers as bare 10 digits and foreign ones with their
// "+<code>" prefix, so a number without "+" is Indian.
export function formatMobileWithCountryCode(raw) {
  if (raw == null) return raw;
  const value = String(raw).trim();
  if (!value || value === 'NA') return raw;
  if (value.includes('*')) return value.startsWith('+') ? value : `+91 ${value}`;

  const parsed = parsePhoneNumberFromString(value, 'IN');
  if (parsed) return parsed.formatInternational();
  return value.startsWith('+') ? value : `+91 ${value}`;
}
