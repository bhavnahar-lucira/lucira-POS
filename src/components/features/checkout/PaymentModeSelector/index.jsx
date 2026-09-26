'use client';

// Icon-on-top payment mode tiles. The mode set is fully data-driven from
// usePaymentModes; the icon is a cosmetic lookup by mode_code with a
// generic fallback, so an unmapped mode is never hidden.

import { Loader2, CreditCard, Check, Smartphone, Banknote, Landmark, Wallet, Calculator, Coins } from 'lucide-react';
import APP_CONFIG from '@/constants/appConfig';

const ICON_BY_CODE = {
  UPI:         Smartphone,
  CASH:        Banknote,
  CARD:        CreditCard,
  CREDITCARD:  CreditCard,
  DEBITCARD:   CreditCard,
  NETBANKING:  Landmark,
  WALLET:      Wallet,
  EMI:         Calculator,
};

function iconFor(mode) {
  // Checked by modeType first, not modeCode — Loyalty's mode_code differs
  // by environment ("Nector" on UAT vs "NectorLoyalty" on LIVE).
  if (mode.modeType === APP_CONFIG.PAYMENT_MODES.LOYALTY_MODE_TYPE) return Coins;
  const key = (mode.modeCode ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return ICON_BY_CODE[key] ?? CreditCard;
}

/**
 * @param {{
 *   paymentModes: { modeId: number, modeName: string, modeCode?: string }[],
 *   selectedModeIds: number[],
 *   onToggle: (modeId: number) => void,
 *   isLoading?: boolean,
 *   isError?: boolean,
 *   disabledModeIds?: number[],
 *   disabledReasons?: Record<number, string>,
 * }} props
 *   disabledModeIds/disabledReasons — a fetched-but-currently-unusable mode
 *   (Nector Loyalty with no eligible redemption right now) renders greyed
 *   out with its reason as a tooltip, rather than being hidden — the mode
 *   is real and fetched from OrnaVerse either way, only its usability
 *   depends on this specific customer/cart.
 */
export default function PaymentModeSelector({
  paymentModes,
  selectedModeIds,
  onToggle,
  isLoading,
  isError,
  disabledModeIds = [],
  disabledReasons = {},
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading payment modes…
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive py-2">
        Failed to load payment modes. Please try again.
      </p>
    );
  }

  if (paymentModes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No payment modes available.</p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {paymentModes.map((mode) => {
        const isSelected = selectedModeIds.includes(mode.modeId);
        const isDisabled = disabledModeIds.includes(mode.modeId);
        const Icon = iconFor(mode);
        return (
          <button
            key={mode.modeId}
            type="button"
            onClick={() => !isDisabled && onToggle(mode.modeId)}
            aria-pressed={isSelected}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            title={isDisabled ? disabledReasons[mode.modeId] : undefined}
            className={`
              relative flex flex-col items-center justify-center gap-1.5
              min-h-[72px] px-2 py-3 rounded-xl border text-sm font-medium
              transition-colors
              ${isDisabled
                ? 'cursor-not-allowed border-border bg-muted text-muted-foreground/50 opacity-60'
                : isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground/80 hover:border-muted-foreground/30'}
            `}
          >
            {isSelected && !isDisabled && (
              <span
                className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-hidden="true"
              >
                <Check size={10} />
              </span>
            )}
            <Icon size={20} className={isDisabled ? 'text-muted-foreground/50' : isSelected ? 'text-primary' : 'text-muted-foreground'} aria-hidden="true" />
            <span className="truncate max-w-full text-xs">{mode.modeName}</span>
          </button>
        );
      })}
    </div>
  );
}
