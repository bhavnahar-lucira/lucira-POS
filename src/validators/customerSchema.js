import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js/max';
import { isMaskedValue } from '@/lib/normalizers/customer';

// ── PAN ──────────────────────────────────────────────────────────────────────
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// ── GSTIN ────────────────────────────────────────────────────────────────────
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// ── Mobile / Phone ───────────────────────────────────────────────────────────
// A masked value ("******5670") is never something the user typed — it only
// ever reaches here as a disabled field's untouched, OrnaVerse-returned echo
// (see the customer edit page's masked-field handling). It must pass through
// unvalidated, or OrnaVerse masking the number for a non-admin session would
// block saving ANY OTHER field on the same form.
export const mobileSchema = z
  .string()
  .min(1, { message: 'Mobile number is required' })
  .refine((v) => isMaskedValue(v) || isValidPhoneNumber(v), { message: 'Enter a valid mobile number' });

export const phoneSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || isMaskedValue(v) || isValidPhoneNumber(v), { message: 'Enter a valid phone number' });

// ── Identity documents ───────────────────────────────────────────────────────
// Same masked-echo concern as mobile/phone above — PAN, GSTIN and Aadhaar are
// all OrnaVerse compliance fields it may mask for a non-admin session.
export const aadhaarSchema = z
  .string()
  .refine((v) => !v || isMaskedValue(v) || /^\d{12}$/.test(v), { message: 'Enter a 12-digit Aadhaar number' })
  .optional()
  .or(z.literal(''));

// ── Create Customer ────────────────────────────────────────────────────────────
// Used by NewCustomerForm
export const customerSchema = z.object({
  party_name: z
    .string()
    .min(1, { message: 'Customer name is required' })
    .max(100, { message: 'Name is too long' }),

  mobile: mobileSchema,
  phone:  phoneSchema,

  email: z
    .string()
    .email({ message: 'Enter a valid email address' })
    .optional()
    .or(z.literal('')),

  pan_no: z
    .string()
    .regex(PAN_REGEX, { message: 'Enter a valid PAN (e.g. ABCDE1234F)' })
    .optional()
    .or(z.literal('')),

  tax_no: z
    .string()
    .regex(GSTIN_REGEX, { message: 'Enter a valid 15-character GSTIN' })
    .optional()
    .or(z.literal('')),

  passport_number: z.string().max(20, { message: 'Passport number is too long' }).optional().or(z.literal('')),
  aadhaar_number:  aadhaarSchema,
  dl_number:       z.string().max(30, { message: 'Driving license number is too long' }).optional().or(z.literal('')),

  address:   z.string().optional().or(z.literal('')),
  address_1: z.string().optional().or(z.literal('')),
  country_id: z.number().int().positive().optional().nullable(),
  state_id:   z.number().int().positive().optional().nullable(),
  city_id:    z.number().int().positive().optional().nullable(),
  nationality_id: z.number().int().positive().optional().nullable(),

  pin_code: z
    .string()
    .regex(/^\d{6}$/, { message: 'Enter a 6-digit PIN code' })
    .optional()
    .or(z.literal('')),

  birth_date:  z.string().optional().or(z.literal('')),
  anniversary: z.string().optional().or(z.literal('')),

  // gender: 1=Male, 2=Female, 3=Other (OrnaVerse enum)
  gender: z.number().int().optional().nullable(),

  // marital_status: 1=Married, 2=Unmarried (OrnaVerse enum — confirmed live
  // 2026-10-24 against OrnaVerse's own Create Customer form)
  marital_status: z.number().int().optional().nullable(),

  // religion_id: see RELIGION_OPTIONS in constants/customerOptions.js
  religion_id: z.number().int().optional().nullable(),

  allow_credit: z.boolean().optional(),
  credit_limit: z.string().optional().or(z.literal('')),
});

// ── Update Customer ────────────────────────────────────────────────────────────
// A factory, not a static schema: an existing customer's identity fields can
// already hold a value OrnaVerse itself won't let this session fix — masked
// for a non-admin (see mobileSchema's comment), or, confirmed live
// 2026-10-14, a non-admin aadhaar_number write that OrnaVerse silently
// truncates to its last 4 digits rather than rejecting outright, leaving a
// value that can never re-pass a strict regex. Either way, a field the user
// hasn't touched should never block saving everything else on the form — so
// "exactly the value already on file" is always accepted alongside "masked"
// and "a real, valid value" for the one field that's actually affected.
export function buildUpdateCustomerSchema(raw) {
  const unchanged = (key) => (v) => raw != null && String(v ?? '') === String(raw[key] ?? '');

  return z.object({
    party_name: z
      .string()
      .min(1, { message: 'Customer name is required' })
      .max(100, { message: 'Name is too long' }),

    mobile: mobileSchema,
    phone:  phoneSchema,

    email: z
      .string()
      .email({ message: 'Enter a valid email address' })
      .optional()
      .or(z.literal('')),

    pan_no: z
      .string()
      .refine((v) => !v || isMaskedValue(v) || unchanged('pan_no')(v) || PAN_REGEX.test(v), { message: 'Enter a valid PAN (e.g. ABCDE1234F)' })
      .optional()
      .or(z.literal('')),

    tax_no: z
      .string()
      .refine((v) => !v || isMaskedValue(v) || unchanged('tax_no')(v) || GSTIN_REGEX.test(v), { message: 'Enter a valid 15-character GSTIN' })
      .optional()
      .or(z.literal('')),

    passport_number: z.string().max(20, { message: 'Passport number is too long' }).optional().or(z.literal('')),
    aadhaar_number: z
      .string()
      .refine((v) => !v || isMaskedValue(v) || unchanged('aadhaar_number')(v) || /^\d{12}$/.test(v), { message: 'Enter a 12-digit Aadhaar number' })
      .optional()
      .or(z.literal('')),
    dl_number: z.string().max(30, { message: 'Driving license number is too long' }).optional().or(z.literal('')),

    address:   z.string().optional().or(z.literal('')),
    address_1: z.string().optional().or(z.literal('')),

    country_id: z.number().int().positive().optional().nullable(),
    state_id:   z.number().int().positive().optional().nullable(),
    city_id:    z.number().int().positive().optional().nullable(),
    nationality_id: z.number().int().positive().optional().nullable(),

    pin_code: z
      .string()
      .regex(/^\d{6}$/, { message: 'Enter a 6-digit PIN code' })
      .optional()
      .or(z.literal('')),

    birth_date:     z.string().optional().or(z.literal('')),
    anniversary:    z.string().optional().or(z.literal('')),
    gender:         z.number().int().optional().nullable(),
    marital_status: z.number().int().optional().nullable(),
    religion_id:    z.number().int().optional().nullable(),
    allow_credit:   z.boolean().optional(),
    credit_limit:   z.string().optional().or(z.literal('')),
  });
}