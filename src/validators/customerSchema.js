import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js/max';

// ── PAN ──────────────────────────────────────────────────────────────────────
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// ── GSTIN ────────────────────────────────────────────────────────────────────
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// ── Mobile / Phone ───────────────────────────────────────────────────────────
export const mobileSchema = z
  .string()
  .min(1, { message: 'Mobile number is required' })
  .refine((v) => isValidPhoneNumber(v), { message: 'Enter a valid mobile number' });

export const phoneSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || isValidPhoneNumber(v), { message: 'Enter a valid phone number' });

// ── Identity documents ───────────────────────────────────────────────────────
export const aadhaarSchema = z
  .string()
  .regex(/^\d{12}$/, { message: 'Enter a 12-digit Aadhaar number' })
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

  // marital_status: 1=Single, 2=Married (OrnaVerse enum)
  marital_status: z.number().int().optional().nullable(),
});

// ── Update Customer ────────────────────────────────────────────────────────────
export const updateCustomerSchema = z.object({
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

  birth_date:     z.string().optional().or(z.literal('')),
  anniversary:    z.string().optional().or(z.literal('')),
  gender:         z.number().int().optional().nullable(),
  marital_status: z.number().int().optional().nullable(),
});