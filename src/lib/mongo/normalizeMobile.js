export function normalizeMobileKey(mobile) {
  if (!mobile) return null;
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}
