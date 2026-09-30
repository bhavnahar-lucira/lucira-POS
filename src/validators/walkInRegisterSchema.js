import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js/max';
import { mobileSchema } from '@/validators/customerSchema';

export const walkInRegisterSchema = z.object({
  mobile:         mobileSchema,
  first_name:     z.string().min(1, { message: 'First name is required' }),
  last_name:      z.string().optional().or(z.literal('')),
  phone:          z.string().optional().or(z.literal(''))
    .refine((v) => !v || isValidPhoneNumber(v), { message: 'Enter a valid phone number' }),
  email:          z.string().optional().or(z.literal(''))
    .refine((v) => !v || z.string().email().safeParse(v).success, { message: 'Enter a valid email' }),
  gender:         z.number().nullable().optional(),
  marital_status: z.number().nullable().optional(),
  birth_date:     z.string().optional().or(z.literal('')),
  anniversary:    z.string().optional().or(z.literal('')),
  country_id:     z.number().nullable().optional(),
  state_id:       z.number().nullable().optional(),
  city_id:        z.number().nullable().optional(),
  pin_code:       z.string().optional().or(z.literal('')),
  address:        z.string().optional().or(z.literal('')),
  source_id:      z.number().nullable().optional(),
  interest:       z.array(z.number()).optional(),
  budget:         z.number().nullable().optional(),
  notes:          z.string().optional().or(z.literal('')),
});
