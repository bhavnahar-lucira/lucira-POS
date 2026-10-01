'use client';

// Shared payment/payout/refund mode picker (react-hook-form Controller +
// shadcn Select). Field values are numeric modeIds; converted to/from
// string at the Select boundary since Radix Select only works with strings.
//
// bankFieldName/refFieldName (2026-10-01, reported directly: "the reference
// number box is not added" in Scheme's payment — checkout's own
// CheckoutPaymentSection shows a bank account + reference number field for
// any bank-settled mode, Card/UPI/etc., but every OTHER place in the app
// that collects a payment — Scheme receipts, Repair invoices, Invoice
// "Collect Payment", Refund payout — reused this bare dropdown and never
// got that field at all, even though OrnaVerse's own payload schema for
// several of these already has somewhere to put it). Opt-in: a caller that
// doesn't pass these props renders exactly as before.
import { Controller, useWatch } from 'react-hook-form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import BankPosSelect from '@/components/features/checkout/BankPosSelect';
import { paymentRequiresBank } from '@/lib/checkout/paymentModeRules';

/**
 * @param {{
 *   control:       object,   — react-hook-form control
 *   name:          string,   — field name bound to the mode_id
 *   paymentModes:  { modeId: number, modeName: string }[],
 *   modesLoading?: boolean,
 *   placeholder?:  string,
 *   onSelect?:     (mode: { modeId: number, modeName: string }) => void,
 *   bankFieldName?: string, — RHF field name for the bank account id. When
 *     given, a BankPosSelect appears whenever the CURRENTLY selected mode
 *     needs one (paymentModeRules.paymentRequiresBank — same rule checkout
 *     uses: not Cash, not a helper/credit row, not Nector Loyalty).
 *   refFieldName?:  string, — RHF field name for the reference number.
 *     Same gating as bankFieldName; the two are independent so a caller
 *     whose own payload has no bank_pos field (e.g. Refund payout) can pass
 *     only refFieldName.
 * }} props
 */
export default function PaymentModeSelect({
  control,
  name,
  paymentModes,
  modesLoading = false,
  placeholder = 'Select payment mode',
  onSelect,
  bankFieldName,
  refFieldName,
}) {
  // Reactively tracks the mode_id field this component itself owns, so the
  // bank/reference fields appear the instant a bank-settled mode is picked
  // — no extra wiring needed from the caller beyond the two field names.
  const selectedModeId = useWatch({ control, name });
  const selectedMode = paymentModes.find((m) => m.modeId === Number(selectedModeId));
  const needsBank = !!selectedMode && paymentRequiresBank(selectedMode);

  return (
    <div className="flex flex-col gap-2">
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            value={field.value != null && field.value !== '' ? String(field.value) : ''}
            onValueChange={(value) => {
              const modeId = Number(value);
              field.onChange(modeId);
              const mode = paymentModes.find((m) => m.modeId === modeId);
              if (mode) onSelect?.(mode);
            }}
            disabled={modesLoading}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder={modesLoading ? 'Loading…' : placeholder} />
            </SelectTrigger>
            <SelectContent>
              {paymentModes.map((mode) => (
                <SelectItem key={mode.modeId} value={String(mode.modeId)}>
                  {mode.modeName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      {needsBank && bankFieldName && (
        <Controller
          name={bankFieldName}
          control={control}
          render={({ field }) => (
            <BankPosSelect value={field.value ?? null} onChange={field.onChange} />
          )}
        />
      )}

      {needsBank && refFieldName && (
        <Controller
          name={refFieldName}
          control={control}
          render={({ field }) => (
            <Input
              value={field.value ?? ''}
              onChange={field.onChange}
              placeholder="Reference number"
              aria-label="Reference number"
              className="h-10"
            />
          )}
        />
      )}
    </div>
  );
}
