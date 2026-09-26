// src/hooks/checkout/usePaymentModes.js
// Fetch available payment modes for checkout.
// Cached for STALE_TIME.STATIC (30 min) — payment modes rarely change.
//
// FILTER RULES (see APP_CONFIG.PAYMENT_MODES for rationale):
//   SHOW if: only_for_pos === true OR mode_code in ALLOWLIST
//   HIDE if: mode_code in DENYLIST
//
// Confirmed PaymentReceiptModeRow fields (v1.json):
//   mode_id, mode_code, mode_name, only_for_pos,
//   is_disabled, allow_selection, is_pos_machine

import { useQuery } from '@tanstack/react-query';
import { getPaymentModes } from '@/services/settingsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

function normalizeMode(entity) {
  return {
    modeId:       entity.mode_id,
    modeCode:     entity.mode_code   ?? null,
    modeName:     entity.mode_name && entity.mode_name !== 'NA' ? entity.mode_name : 'Unknown',
    onlyForPos:   entity.only_for_pos  ?? false,
    allowSelection:entity.allow_selection ?? true,
    isPosMachine: entity.is_pos_machine  ?? false,  // bank POS terminal
    isDisabled:   entity.is_disabled     ?? false,
    // ADDED 2026-09-09 — see isPosPaymentMode's own comment for why this is
    // now part of the filter.
    modeSubType:  entity.mode_sub_type ?? null,
    // ADDED 2026-09-25 — Nector Loyalty's own stable discriminator (see
    // APP_CONFIG.PAYMENT_MODES.LOYALTY_MODE_TYPE); mode_code/mode_id both
    // differ by environment, this doesn't.
    modeType:     entity.mode_type ?? null,
    // Confirmed 2026-07-16 via real Refund/List and Invoice/List data — every
    // PaymentReceiptModeRow carries its own ledger_id, and RefundDetailsRow
    // genuinely requires one. Use the mode's own value rather than inventing one.
    ledgerId:     entity.ledger_id ?? null,
    raw:          entity,
  };
}

// FIXED 2026-09-09 — CONFIRMED LIVE: "Advance" (mode_id 9) has
// only_for_pos:true and was never in DENYLIST (only "Order Advance", a
// DIFFERENT mode_code, was), so it slipped through and showed up as a
// normal selectable tender in the checkout payment picker. But
// documentFields.js's own header (confirmed live 2026-08-19, reading
// OrnaVerse's own compiled client) already established that mode_sub_type
// === 2 is THE discriminator their own code uses to recognize a
// credit-application row — a receipt-knockoff mechanism, not something an
// operator manually picks the way they pick Cash/Card/UPI. Every other
// mode_sub_type:2 row on this tenant ("Order Advance", "Return", "Scheme
// Payment", "scheme Enrollment", "COD") was already correctly excluded, just
// by name in DENYLIST rather than by this reliable, general property —
// which is exactly why "Advance" (the same category, just a differently-
// named row) slipped through: a manually-maintained name list will always
// eventually miss one. Excluding by mode_sub_type here is the robust fix;
// DENYLIST stays for the OTHER reason a mode can be wrong for an in-person
// counter — a genuine mode_sub_type:1 tender that's still not applicable
// here (an online-only channel like GoKwik/Razorpay/District-Zomato).
function isPosPaymentMode(mode) {
  if (mode.isDisabled) return false;
  // Nector Loyalty is mode_sub_type:2 (a credit-knockoff row, same
  // classification as Exchange/Scheme/Advance) but must NOT be excluded
  // here — unlike those, it's meant to appear as a real tile in the
  // checkout payment picker (see CheckoutPaymentSection), just one that
  // gets disabled rather than hidden when the customer has nothing to
  // redeem. Every other mode_sub_type:2 row stays excluded.
  if (mode.modeSubType === 2 && mode.modeType !== APP_CONFIG.PAYMENT_MODES.LOYALTY_MODE_TYPE) return false;
  const { ALLOWLIST, DENYLIST } = APP_CONFIG.PAYMENT_MODES;
  if (DENYLIST.includes(mode.modeCode)) return false;
  return mode.onlyForPos === true || ALLOWLIST.includes(mode.modeCode);
}

export function usePaymentModes() {
  const query = useQuery({
    queryKey: QUERY_KEYS.SETTINGS.PAYMENT_MODES(),
    queryFn:  async () => {
      // getPaymentModes returns response.data (service unwraps)
      const data     = await getPaymentModes();
      const entities = data?.Entities ?? [];
      return entities.map(normalizeMode).filter(isPosPaymentMode);
    },
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  return {
    paymentModes: query.data ?? [],
    isLoading:    query.isLoading,
    isError:      query.isError,
    refetch:      query.refetch,
  };
}