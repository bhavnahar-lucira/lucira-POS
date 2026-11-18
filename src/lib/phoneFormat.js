import { parsePhoneNumberFromString } from 'libphonenumber-js';

// OrnaVerse stores Indian numbers as bare 10 digits and foreign ones with their
// "+<code>" prefix, so a number without "+" is Indian.
// Shown without spaces so click-to-call extensions (FreJun) recognise the number.
export function formatMobileWithCountryCode(raw) {
  if (raw == null) return raw;
  const value = String(raw).trim();
  if (!value || value === 'NA') return raw;
  const compact = value.replace(/[\s\-().]/g, '');
  if (compact.includes('*')) return compact.startsWith('+') ? compact : `+91${compact}`;

  const parsed = parsePhoneNumberFromString(value, 'IN');
  if (parsed) return parsed.number;
  return compact.startsWith('+') ? compact : `+91${compact}`;
}

export function toTelHref(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value || value === 'NA' || value.includes('*')) return null;

  try {
    const parsed = parsePhoneNumberFromString(value, 'IN');
    if (parsed) {
      const uri = parsed.getURI();
      if (uri) return uri;
    }
  } catch {
    // fallback below
  }

  const cleaned = value.replace(/[^\d+]/g, '');
  if (!cleaned || cleaned.replace(/\D/g, '').length < 7) return null;
  if (/^\d{10}$/.test(cleaned)) return `tel:+91${cleaned}`;
  if (/^91\d{10}$/.test(cleaned)) return `tel:+${cleaned}`;
  return cleaned.startsWith('+') ? `tel:${cleaned}` : `tel:+91${cleaned}`;
}
