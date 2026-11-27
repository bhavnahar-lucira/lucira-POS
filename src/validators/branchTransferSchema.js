import { z } from 'zod';

export const TRANSFER_DOC_TYPES = ['branch_out', 'branch_in', 'allocation'];
export const TRANSFER_ACTIONS = ['created', 'posted', 'cancelled', 'authorised', 'updated', 'approval_requested', 'approved', 'rejected'];

export const transferEventSchema = z.object({
  doc_type:       z.enum(TRANSFER_DOC_TYPES),
  transaction_id: z.coerce.number().int().positive(),
  document_no:    z.string().trim().max(60).nullable().optional(),
  action:         z.enum(TRANSFER_ACTIONS),
  note:           z.string().trim().max(500).nullable().optional(),
});

export const APPROVAL_KINDS = ['send', 'receive'];

export const approvalRequestSchema = z.object({
  kind:           z.enum(APPROVAL_KINDS),
  transaction_id: z.coerce.number().int().positive(),
  document_no:    z.string().trim().max(60).nullable().optional(),
  counterparty:   z.string().trim().max(160).nullable().optional(),
  pieces:         z.coerce.number().int().nonnegative().nullable().optional(),
  net_amount:     z.coerce.number().nonnegative().nullable().optional(),
  note:           z.string().trim().max(500).nullable().optional(),
});

export const approvalDecisionSchema = z.object({
  id:       z.string().trim().length(24),
  decision: z.enum(['approve', 'reject']),
  reason:   z.string().trim().max(500).nullable().optional(),
}).refine((v) => v.decision === 'approve' || !!v.reason, { message: 'Give a reason for rejecting', path: ['reason'] });
