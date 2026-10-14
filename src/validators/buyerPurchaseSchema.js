// src/validators/buyerPurchaseSchema.js
//
// Guards the /api/buyers/record-purchase body. Same numeric-coercion
// leniency as abandonedCartSchema.js (OUR OWN shape, generated from
// toOrderItems()/summarizeAppliedPromotions() in orderTracking.js, not
// mirrored from OrnaVerse) — items/promotions/payments stay loosely typed
// (z.record) rather than re-declaring every possible field, same reasoning
// cartSlice.js's own creditRef comment gives for not re-declaring a shape
// that already lives in one real place.

import { z } from 'zod';

const numeric = () => z.coerce.number();
const looseRow = z.record(z.string(), z.any());

export const recordPurchaseSchema = z.object({
  customerId:      numeric().int().positive(),
  customerName:    z.string().nullable().optional(),
  customerMobile:  z.string().nullable().optional(),
  customerEmail:   z.string().nullable().optional(),
  customerAddress: looseRow.nullable().optional(),
  transactionId:   numeric().int().positive(),
  documentType:    z.enum(['invoice', 'order']),
  documentNo:      z.string().nullable().optional(),
  documentDate:    z.coerce.date(),
  companyId:       numeric().int().positive(),
  storeName:       z.string().nullable().optional(),
  salesPersonId:   numeric().int().nullable().optional(),
  salesPersonName: z.string().nullable().optional(),
  items:           z.array(looseRow).optional().default([]),
  promotions:      z.array(looseRow).optional().default([]),
  payments:        z.array(looseRow).optional().default([]),
  totalAmount:     numeric().nullable().optional(),
});
