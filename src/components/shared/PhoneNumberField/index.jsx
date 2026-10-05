'use client';

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
      inputComponent={Input}
      placeholder={placeholder}
      disabled={disabled}
      className="pos-phone-input"
      numberInputProps={{ className: 'h-11' }}
    />
  );
}
