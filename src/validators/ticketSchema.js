import { z } from 'zod';
import { TICKET_MAX_FILES, advanceModeFields } from '@/lib/ticketing/constants';

const text = (max = 100) => z.string().trim().max(max);
const optionalText = (max = 100) => z.preprocess((v) => v ?? undefined, text(max).optional()).transform((v) => v || null);
const optionalAmount = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.number().nonnegative().nullable(),
);
const fileIds = z.array(z.string().regex(/^[a-f0-9]{32}$/)).max(TICKET_MAX_FILES);

export const ticketSpecsSchema = z.object({
  category:          text().min(1, 'Category is required'),
  metal:             optionalText(),
  karat:             optionalText(),
  size:              optionalText(),
  budget:            optionalAmount,
  gold_weight:       optionalAmount,
  requirement_notes: text(2000).min(3, 'Describe the customer requirement'),
  description:       optionalText(2000),
});

const isoDate = (message) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message);

const optionalId = z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().positive().nullable());

export const confirmOrderSchema = z.object({
  order_date:             isoDate('Select the order date'),
  order_amount:           z.coerce.number().positive('Enter the order amount'),
  amount_received:        optionalAmount,
  advance_received_on:    z.preprocess((v) => v || null, isoDate('Select the advance received date').nullable()),
  payment_mode_id:        optionalId,
  payment_mode:           optionalText(),
  bank_pos_id:            optionalId,
  reference_no:           optionalText(100),
  payment_details:        z.record(z.string(), z.string().trim().max(100)).default({}),
  advance_receipt_id:     optionalId,
  expected_delivery_date: isoDate('Select the expected delivery date'),
  karat:                  text().min(1, 'Select the karat'),
  metal:                  optionalText(),
  size:                   optionalText(),
  description:            optionalText(2000),
  remarks:                optionalText(1000),
}).superRefine((o, ctx) => {
  if (!o.amount_received) return;
  if (!o.advance_received_on) ctx.addIssue({ code: 'custom', message: 'Select the advance received date', path: ['advance_received_on'] });
  if (!o.payment_mode_id) ctx.addIssue({ code: 'custom', message: 'Select the payment mode', path: ['payment_mode_id'] });
  if (!o.advance_receipt_id) ctx.addIssue({ code: 'custom', message: 'The advance receipt was not created', path: ['advance_receipt_id'] });
  for (const field of advanceModeFields(o.payment_mode)) {
    const value = o.payment_details[field.key];
    if (field.required && !value) ctx.addIssue({ code: 'custom', message: `Enter the ${field.label.toLowerCase()}`, path: ['payment_details', field.key] });
    else if (value && field.type === 'last4' && !/^\d{4}$/.test(value)) ctx.addIssue({ code: 'custom', message: 'Enter the last 4 digits of the card', path: ['payment_details', field.key] });
  }
}).transform((o) => {
  // Payment details only travel with an advance, and only the fields of the chosen mode.
  if (!o.amount_received) {
    return { ...o, payment_mode_id: null, payment_mode: null, bank_pos_id: null, reference_no: null, payment_details: {}, advance_receipt_id: null };
  }
  const fields = advanceModeFields(o.payment_mode);
  return { ...o, payment_details: Object.fromEntries(fields.filter((f) => o.payment_details[f.key]).map((f) => [f.key, o.payment_details[f.key]])) };
});

export const createTicketSchema = z.object({
  customer: z.object({
    party_id: z.coerce.number().int().positive(),
    name:     text(200).min(1),
    mobile:   optionalText(30),
  }),
  sales_person: z.object({
    id:   z.coerce.number().int().positive(),
    name: text(200).min(1),
  }),
  specs:    ticketSpecsSchema,
  file_ids: fileIds.min(1, 'Add at least one reference image'),
});

export const ticketActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update_request'), specs: ticketSpecsSchema, file_ids: fileIds.default([]) }),
  z.object({ action: z.literal('approve_g2d'), round: z.coerce.number().int().positive(), order: confirmOrderSchema }),
  z.object({
    action:   z.literal('reject_g2d'),
    round:    z.coerce.number().int().positive(),
    feedback: text(2000).min(3, 'Enter the changes the customer wants'),
  }),
  z.object({ action: z.literal('approve_design'), version: text(20) }),
  z.object({
    action:   z.literal('reject_design'),
    version:  text(20),
    feedback: text(2000).min(3, 'Enter the customer feedback for the CAD team'),
  }),
  z.object({ action: z.literal('cancel'), reason: text(1000).min(3, 'Enter the cancellation reason') }),
  z.object({ action: z.literal('order_placed'), transaction_id: z.coerce.number().int().positive() }),
]);
