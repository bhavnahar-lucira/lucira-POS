// src/lib/checkout/paymentModeRules.js
//
// Whether a payment row needs a bank account + reference number — shared by
// CheckoutPaymentSection (the UI, decides whether to render the fields) and
// checkoutSchema (validation, decides whether Place Order is blocked without
// them). These used to be two separate copies of the same rule; when Nector
// Loyalty was added as a payment mode, only the UI copy was taught to
// exempt it — the schema's copy still demanded a bank account and reference
// number for a row that has neither, silently failing validation and
// disabling Place Order the moment Loyalty was selected (reported directly).
// One shared function means there's only one place left to update the next
// time a new credit-style mode shows up in OrnaVerse's own payment mode list.
//
// Cash never needs a bank. A credit-style row never does either — either a
// helper balance (Scheme/Exchange/Credit Note/Old Gold/Advance), identified
// by `creditRef` being present, or Nector Loyalty, identified by its own
// stable `mode_type` (mode_code/mode_id both differ by environment).
import APP_CONFIG from '@/constants/appConfig';

export function paymentRequiresBank(mode) {
  if (mode.creditRef) return false;
  if (mode.modeCode === 'Cash') return false;
  if (mode.modeType === APP_CONFIG.PAYMENT_MODES.LOYALTY_MODE_TYPE) return false;
  return true;
}
