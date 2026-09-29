// src/validators/customerSchema.js
// Zod schemas for customer create and update forms.
// Field names match POS.CustomerRow (v1.json): party_name is a single full-name
// field (no first/last split); pan_no (not pan); address/address_1 are line 1/2;
// city_id/state_id/country_id are numeric master IDs; gender/marital_status are enums.

import { z } from 'zod';
// react-phone-number-input's own re-exported isValidPhoneNumber uses its
// bundled lightweight ("min") metadata, which only checks a loose possible
// length range per country — it accepted 8- and 9-digit Indian numbers as
// "valid" (confirmed 2026-09-28). libphonenumber-js/max ships the full
// per-country number-pattern metadata and correctly rejects those.
import { isValidPhoneNumber } from 'libphonenumber-js/max';

// ── PAN ──────────────────────────────────────────────────────────────────────
// Shared so checkout's ₹2,00,000 mandatory-PAN gate validates the exact same
// format as the customer create/update forms, instead of a drifted copy.
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// ── GSTIN ────────────────────────────────────────────────────────────────────
// Standard 15-character Indian GSTIN: 2-digit state code + 10-char PAN +
// 1-digit entity code + 'Z' (fixed) + 1 checksum char. Added 2026-09-17 —
// OrnaVerse's own POS.CustomerRow schema (tax_no) has always supported this;
// this app's create/update forms never collected it, so a GST-registered
// business customer had nowhere to record their GSTIN.
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// ── Mobile / Phone ───────────────────────────────────────────────────────────
// Both fields hold a full E.164 string ("+919812345670") from
// PhoneNumberField (see that component's own header) — validated via the
// same library's own isValidPhoneNumber, not a hand-rolled regex, since the
// field now supports any country's numbering plan, not just India's.
//
// Mobile is mandatory on both create AND edit — CONFIRMED live on UAT's own
// edit-customer form (asterisk, and it genuinely refuses to save blank).
// This app's own edit form previously allowed a blank save regardless of
// the asterisk shown — see updateCustomerSchema's own history below.
export const mobileSchema = z
  .string()
  .min(1, { message: 'Mobile number is required' })
  .refine((v) => isValidPhoneNumber(v), { message: 'Enter a valid mobile number' });

// Phone is optional everywhere (no asterisk on OrnaVerse's own form either)
// — only checked for validity once something's actually been entered.
export const phoneSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine((v) => !v || isValidPhoneNumber(v), { message: 'Enter a valid phone number' });

// ── Identity documents ───────────────────────────────────────────────────────
// Added 2026-09-17 to match OrnaVerse's own live Customer create form
// ("Identity Documents" section) — Passport/Aadhaar/Driving License, plus
// PAN/GSTIN which this app already collected. Loose formats deliberately —
// unlike PAN/GSTIN, OrnaVerse doesn't appear to validate these client-side
// either (a passport number format varies too much across countries to
// usefully regex, and there's no confirmed live example of dl_number to
// pattern-match against). aadhaar_number is numeric on POS.CustomerRow, but
// collected as a string here and Number()'d at the payload boundary — an
// <input> can't hold a 12-digit value as a JS number without precision or
// leading-zero loss.
export const aadhaarSchema = z
  .string()
  .regex(/^\d{12}$/, { message: 'Enter a 12-digit Aadhaar number' })
  .optional()
  .or(z.literal(''));

// NOTE: `pan_document`/`other_document` (the two file-upload slots under
// OrnaVerse's own "Identity Documents" section) are deliberately NOT
// collected here. Confirmed live 2026-09-17 on UAT: sending a base64 data
// URI into either field 500s on BOTH Create and Update. Real customers DO
// have these populated (as OrnaVerse-side stored paths, e.g.
// "Documents/00002/…jpeg") — so there's a genuine two-step upload mechanism
// (upload the file somewhere first, get back a path, then set the field to
// that path) that hasn't been found yet, not a dead field. Don't re-wire
// these as a raw base64 string without finding that real upload endpoint
// first — see [[ornaverse-apidog-reference]] for how to look one up.

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

  // Cascading location — IDs from location master
  // Optional on create, required only if address is provided
  country_id: z.number().int().positive().optional().nullable(),
  state_id:   z.number().int().positive().optional().nullable(),
  city_id:    z.number().int().positive().optional().nullable(),

  // Confirmed live 2026-09-17: nationality_id is a country_id — a real
  // customer had country_id:101 and nationality_id:101, both "India" —
  // reuses the same Master/Countries/List this form already loads for
  // Country, rather than a separate master.
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
// Used by EditCustomerForm inside CustomerDetailSheet
// All fields optional — only changed fields need to be present in the form
// But buildCustomerUpdatePayload() merges with original raw before sending
//
// FIXED 2026-09-26 (reported directly, and confirmed against OrnaVerse's own
// UAT edit-customer form) — mobile used to be blank-able here, on the theory
// that onSubmit's own `formChanges.mobile || raw.mobile` fallback made a
// blank submission harmless (nothing actually gets cleared server-side).
// That missed the actual problem: the form still let the operator "save"
// what visually looks like a cleared, asterisk-marked mandatory field with
// no error at all — OrnaVerse's own form genuinely refuses this outright.
// Now required here too, same as create.
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