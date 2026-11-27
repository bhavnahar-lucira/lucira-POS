import { z } from 'zod';
import { TICKET_MAX_FILES, TICKET_ITEM_MAX_FILES, TICKET_MAX_ITEMS } from '@/lib/ticketing/constants';

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

const advancePaymentSchema = z.object({
  modeId:    z.number().int().positive(),
  modeCode:  text(50).default(''),
  modeName:  text(100).min(1),
  amount:    z.number().positive(),
  bankPosId: z.number().int().positive().nullable().default(null),
  refNo:     text(100).default(''),
});

export const confirmOrderSchema = z.object({
  order_date:             isoDate('Select the order date'),
  order_amount:           z.coerce.number().positive('Enter the order amount'),
  amount_received:        optionalAmount,
  advance_received_on:    z.preprocess((v) => v || null, isoDate('Select the advance received date').nullable()),
  payment_mode_id:        optionalId,
  payment_mode:           optionalText(500),
  bank_pos_id:            optionalId,
  reference_no:           optionalText(500),
  advance_receipt_id:     optionalId,
  payments:               z.array(advancePaymentSchema).max(10).default([]),
  expected_delivery_date: isoDate('Select the expected delivery date'),
  karat:                  text().min(1, 'Select the karat'),
  metal:                  optionalText(),
  size:                   optionalText(),
  description:            optionalText(2000),
  remarks:                optionalText(1000),
}).superRefine((o, ctx) => {
  if (o.expected_delivery_date <= o.order_date) {
    ctx.addIssue({ code: 'custom', message: 'Expected delivery must be after the order date', path: ['expected_delivery_date'] });
  }
  if (!o.amount_received) return;
  if (!o.advance_received_on) ctx.addIssue({ code: 'custom', message: 'Select the advance received date', path: ['advance_received_on'] });
  if (!o.payments.length) {
    ctx.addIssue({ code: 'custom', message: 'Select the payment mode', path: ['payments'] });
  } else {
    const paid = o.payments.reduce((s, p) => s + p.amount, 0);
    if (Math.abs(paid - o.amount_received) > 0.01) {
      ctx.addIssue({ code: 'custom', message: 'Payment amounts must equal the amount received', path: ['payments'] });
    }
  }
  if (!o.advance_receipt_id) ctx.addIssue({ code: 'custom', message: 'The advance receipt was not created', path: ['advance_receipt_id'] });
}).transform((o) => {
  // Payment details only travel with an advance.
  if (!o.amount_received) {
    return { ...o, payment_mode_id: null, payment_mode: null, bank_pos_id: null, reference_no: null, advance_receipt_id: null, payments: [] };
  }
  return o;
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

const itemFileIds = z.array(z.string().regex(/^[a-f0-9]{32}$/)).max(TICKET_ITEM_MAX_FILES, `Up to ${TICKET_ITEM_MAX_FILES} images per product`);
const itemId = text(40).min(1);

const ticketItemInput = z.object({
  specs:    ticketSpecsSchema,
  file_ids: itemFileIds.min(1, 'Add at least one reference image for every product'),
});

export const createMultiTicketSchema = z.object({
  customer:      createTicketSchema.shape.customer,
  sales_person:  createTicketSchema.shape.sales_person,
  general_notes: optionalText(2000),
  items:         z.array(ticketItemInput).min(1, 'Add at least one product').max(TICKET_MAX_ITEMS, `Up to ${TICKET_MAX_ITEMS} products per ticket`),
});

const confirmItemSchema = z.object({
  item_id:                itemId,
  round:                  z.coerce.number().int().positive(),
  order_amount:           z.coerce.number().positive('Enter the order amount for every product'),
  expected_delivery_date: isoDate('Select the expected delivery date for every product'),
  karat:                  text().min(1, 'Select the karat for every product'),
  metal:                  optionalText(),
  size:                   optionalText(),
  description:            optionalText(2000),
});

const confirmTicketOrderSchema = z.object({
  order_date:          isoDate('Select the order date'),
  items:               z.array(confirmItemSchema).min(1).max(TICKET_MAX_ITEMS),
  amount_received:     optionalAmount,
  advance_received_on: z.preprocess((v) => v || null, isoDate('Select the advance received date').nullable()),
  advance_receipt_id:  optionalId,
  payments:            z.array(advancePaymentSchema).max(10).default([]),
  remarks:             optionalText(1000),
}).superRefine((o, ctx) => {
  o.items.forEach((item, n) => {
    if (item.expected_delivery_date <= o.order_date) {
      ctx.addIssue({ code: 'custom', message: 'Expected delivery must be after the order date for every product', path: ['items', n, 'expected_delivery_date'] });
    }
  });
  if (!o.amount_received) return;
  if (!o.advance_received_on) ctx.addIssue({ code: 'custom', message: 'Select the advance received date', path: ['advance_received_on'] });
  const paid = o.payments.reduce((s, p) => s + p.amount, 0);
  if (!o.payments.length) ctx.addIssue({ code: 'custom', message: 'Select the payment mode', path: ['payments'] });
  else if (Math.abs(paid - o.amount_received) > 0.01) ctx.addIssue({ code: 'custom', message: 'Payment amounts must equal the amount received', path: ['payments'] });
  if (!o.advance_receipt_id) ctx.addIssue({ code: 'custom', message: 'The advance receipt was not created', path: ['advance_receipt_id'] });
}).transform((o) => (o.amount_received ? o : { ...o, advance_received_on: null, advance_receipt_id: null, payments: [] }));

const holdActions = [
  z.object({ action: z.literal('hold'), reason: text(1000).min(3, 'Enter why the ticket is on hold') }),
  z.object({ action: z.literal('resume') }),
];

/** Actions on a multi-product ticket; the product ones carry item_id. */
export const multiTicketActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add_item'), specs: ticketSpecsSchema, file_ids: itemFileIds.min(1, 'Add at least one reference image') }),
  z.object({ action: z.literal('update_request'), item_id: itemId, specs: ticketSpecsSchema, file_ids: itemFileIds.default([]) }),
  z.object({ action: z.literal('approve_g2d'), item_id: itemId, round: z.coerce.number().int().positive() }),
  z.object({
    action:   z.literal('reject_g2d'),
    item_id:  itemId,
    round:    z.coerce.number().int().positive(),
    feedback: text(2000).min(3, 'Enter the changes the customer wants'),
  }),
  z.object({ action: z.literal('confirm_order'), order: confirmTicketOrderSchema }),
  z.object({ action: z.literal('approve_design'), item_id: itemId, version: text(20) }),
  z.object({
    action:   z.literal('reject_design'),
    item_id:  itemId,
    version:  text(20),
    feedback: text(2000).min(3, 'Enter the customer feedback for the CAD team'),
  }),
  z.object({
    action:  z.literal('reopen_final'),
    item_id: itemId,
    target:  z.enum(['cad', 'final']),
    reason:  text(2000).min(3, 'Enter the changes the customer wants'),
  }),
  z.object({ action: z.literal('cancel_item'), item_id: itemId, reason: text(1000).min(3, 'Enter the cancellation reason') }),
  z.object({
    action: z.literal('acknowledge_pricing'),
    mismatches: z.array(z.object({
      label:     text(300),
      workflow:  z.number().nullable(),
      reference: z.number().nullable(),
    })).min(1).max(60),
    note: optionalText(1000),
  }),
  z.object({ action: z.literal('cancel'), reason: text(1000).min(3, 'Enter the cancellation reason') }),
  z.object({ action: z.literal('order_placed'), transaction_id: z.coerce.number().int().positive() }),
  z.object({ action: z.literal('add_comment'), item_id: itemId.nullable().default(null), text: text(2000).min(1, 'Write a comment') }),
  ...holdActions,
]);

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
  z.object({
    action: z.literal('reopen_final'),
    target: z.enum(['cad', 'final']),
    reason: text(2000).min(3, 'Enter the changes the customer wants'),
  }),
  z.object({
    action: z.literal('acknowledge_pricing'),
    mismatches: z.array(z.object({
      label:     text(200),
      workflow:  z.number().nullable(),
      reference: z.number().nullable(),
    })).min(1).max(30),
    note: optionalText(1000),
  }),
  z.object({ action: z.literal('cancel'), reason: text(1000).min(3, 'Enter the cancellation reason') }),
  z.object({ action: z.literal('order_placed'), transaction_id: z.coerce.number().int().positive() }),
  z.object({ action: z.literal('add_comment'), item_id: z.null().default(null), text: text(2000).min(1, 'Write a comment') }),
  ...holdActions,
]);
