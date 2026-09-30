import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js/max';
import { mobileSchema } from '@/validators/customerSchema';

// Required set CONFIRMED against OrnaVerse's own WalkIn form (2026-09-30,
// asterisked fields there): mobile, first_name, last_name, source_id,
// gender, pin_code. Every other field is genuinely optional on that form.
export const walkInRegisterSchema = z.object({
  mobile:         mobileSchema,
  first_name:     z.string().min(1, { message: 'First name is required' }),
  last_name:      z.string().min(1, { message: 'Last name is required' }),
  phone:          z.string().optional().or(z.literal(''))
    .refine((v) => !v || isValidPhoneNumber(v), { message: 'Enter a valid phone number' }),
  email:          z.string().optional().or(z.literal(''))
    .refine((v) => !v || z.string().email().safeParse(v).success, { message: 'Enter a valid email' }),
  gender:         z.number({ invalid_type_error: 'Gender is required', required_error: 'Gender is required' }),
  marital_status: z.number().nullable().optional(),
  birth_date:     z.string().optional().or(z.literal('')),
  anniversary:    z.string().optional().or(z.literal('')),
  country_id:     z.number().nullable().optional(),
  state_id:       z.number().nullable().optional(),
  city_id:        z.number().nullable().optional(),
  pin_code:       z.string().regex(/^\d{6}$/, { message: 'Enter a valid 6-digit PIN code' }),
  address:        z.string().optional().or(z.literal('')),
  source_id:      z.number({ invalid_type_error: 'Source is required', required_error: 'Source is required' }),
  sales_representative_id: z.number().nullable().optional(),
  interest:       z.array(z.number()).optional(),
  budget:         z.number().nullable().optional(),
  notes:          z.string().optional().or(z.literal('')),
});
