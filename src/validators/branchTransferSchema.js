import { z } from 'zod';

export const TRANSFER_DOC_TYPES = ['branch_out', 'branch_in', 'allocation'];
export const TRANSFER_ACTIONS = ['created', 'posted', 'cancelled', 'authorised', 'updated'];

export const transferEventSchema = z.object({
  doc_type:       z.enum(TRANSFER_DOC_TYPES),
  transaction_id: z.coerce.number().int().positive(),
  document_no:    z.string().trim().max(60).nullable().optional(),
  action:         z.enum(TRANSFER_ACTIONS),
  note:           z.string().trim().max(500).nullable().optional(),
});
