'use client';

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
