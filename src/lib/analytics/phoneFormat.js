// Mirrors the website's toE164 (lucirajewelry.com) so POS and website produce the same WebEngage userId.
export function toE164India(mobile) {
  if (!mobile) return null;
  const raw = String(mobile).trim();
  if (!raw) return null;

  if (raw.startsWith('+') && !raw.startsWith('+91') && !raw.startsWith('+0')) {
    const intl = raw.replace(/\D/g, '');
    if (intl.length >= 8 && intl.length <= 15) return `+${intl}`;
  }

  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  while (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2).replace(/^0+/, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;

  const all = raw.replace(/\D/g, '');
  return raw.startsWith('+') && all.length >= 10 && all.length <= 15 && !all.startsWith('0') ? `+${all}` : null;
}
