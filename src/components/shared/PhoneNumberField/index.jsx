'use client';

// Country-code + number picker for Mobile/Phone — replicates OrnaVerse's own
// edit-customer form (a flag/dial-code dropdown + number input, digit limit
// enforced per selected country), reported directly as something this app
// never wired up. Wraps react-phone-number-input (already the standard,
// battle-tested library for exactly this UI/validation, not hand-rolled —
// a real country+dial-code+digit-count dataset isn't worth re-deriving).
//
// Stores the field's OWN value as a full E.164 string (e.g. "+919812345670")
// while the user is editing — see phoneToStoredValue()/storedValueToPhone()
// in lib/normalizers/customer.js for the boundary that converts this to/from
// OrnaVerse's own bare-digit storage convention for India specifically
// (100% of this tenant's real data, and everything else in this app —
// Nector, WebEngage, wishlist/abandoned-cart lookups — assumes a bare
// 10-digit Indian mobile with no country prefix at all).

import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Input } from '@/components/ui/input';

/**
 * @param {{
 *   value: string,             — E.164 string ("+91...") or ''
 *   onChange: (value: string) => void,
 *   id?: string,
 *   placeholder?: string,
 *   disabled?: boolean,
 * }} props
 */
export default function PhoneNumberField({ value, onChange, id, placeholder, disabled = false }) {
  return (
    <PhoneInput
      id={id}
      value={value || undefined}
      onChange={(v) => onChange(v ?? '')}
      defaultCountry="IN"
      international
      // countryCallingCodeEditable left at its default (true) — requested
      // directly: typing a different country's dial code (e.g. "+44...")
      // must be able to switch the selected country itself, not just be
      // rejected/locked to whatever the flag dropdown was last set to.
      inputComponent={Input}
      placeholder={placeholder}
      disabled={disabled}
      className="pos-phone-input"
      numberInputProps={{ className: 'h-11' }}
    />
  );
}
