'use client';

import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Input } from '@/components/ui/input';

/**
 * @param {{
 *   value: string,             — E.164 string ("+91...") or ''
 *   onChange: (value: string) => void,
 *   onBlur?: () => void,
 *   id?: string,
 *   placeholder?: string,
 *   disabled?: boolean,
 * }} props
 */
export default function PhoneNumberField({ value, onChange, onBlur, id, placeholder, disabled = false }) {
  return (
    <PhoneInput
      id={id}
      value={value || undefined}
      onChange={(v) => onChange(v ?? '')}
      // CONFIRMED LIVE 2026-10-08: react-phone-number-input's own internal
      // blur handler always wins over numberInputProps.onBlur (it's spread
      // last internally) — it only forwards to a top-level `onBlur` prop.
      onBlur={onBlur}
      defaultCountry="IN"
      international
      // Without this, a locally-typed number whose leading digits happen to
      // match another country's calling code (e.g. a mobile starting "81")
      // gets silently reparsed as that country instead of India — CONFIRMED
      // LIVE 2026-10-08 with a real customer's number ("8149639991" →
      // "+81 496 39 991", Japan). This app is India-only, so the calling
      // code should never be user-editable in the first place.
      countryCallingCodeEditable={false}
      inputComponent={Input}
      placeholder={placeholder}
      disabled={disabled}
      className="pos-phone-input"
      numberInputProps={{ className: 'h-11' }}
    />
  );
}
