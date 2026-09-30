import { z } from 'zod';

export const customerProfileSchema = z.object({
  party_id: z.number().int().positive(),
  profile:  z.record(z.string(), z.any()),
});
