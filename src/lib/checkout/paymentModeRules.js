import APP_CONFIG from '@/constants/appConfig';

export function paymentRequiresBank(mode) {
  if (mode.creditRef) return false;
  if (mode.modeCode === 'Cash') return false;
  if (mode.modeType === APP_CONFIG.PAYMENT_MODES.LOYALTY_MODE_TYPE) return false;
  return true;
}
