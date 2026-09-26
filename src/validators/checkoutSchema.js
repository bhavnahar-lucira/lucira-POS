// src/validators/checkoutSchema.js
import { z } from 'zod';
import { PAN_REGEX } from '@/validators/customerSchema';
import APP_CONFIG from '@/constants/appConfig';
import { paymentRequiresBank } from '@/lib/checkout/paymentModeRules';

/**
 * Zod validation schema for the checkout screen (Phase 9b).
 * Source of truth: DEVELOPMENT_PHASES.md Phase 9b, ARCHITECTURE.md Section 12
 *
 * - customerId: a customer session must be attached before order submission
 * - paymentModes: at least one payment mode with a positive amount
 * - totalAmount / cartTotal: split payment amounts must sum to the total
 * - allowPartialPayment: true for an ORDER (doc 53) — a booking the customer
 *   leaves an advance against, so any amount up to the full value is valid and
 *   the remainder carries as balance_amount. An INVOICE has no such latitude —
 *   OrnaVerse refuses a short-paid one outright, so it must balance to the rupee.
 * - panNumber: mandatory once totalAmount crosses the statutory PAN threshold
 *   (Income Tax Rule 114B) — see APP_CONFIG.COMPLIANCE.
 */

const paymentModeSchema = z.object({
  // Nullable: a toggled credit/helper balance (Scheme/Exchange/Credit Note/Old
  // Gold/Advance) has no PaymentReceiptMode selection — its real mode_id/mode_code
  // come from the source credit receipt (creditRef) instead. Requiring a number
  // unconditionally silently failed safeParse for every credit-applied submission.
  modeId: z.number({ message: 'Payment mode is required' }).nullable(),
  modeName: z.string().min(1),
  amount: z
    .number({ message: 'Enter an amount' })
    .positive({ message: 'Amount must be greater than 0' }),
  // modeCode/bankPosId/refNo were previously unvalidated even though bank-settled
  // tenders require them (CheckoutPaymentSection's requiresBank() check; the
  // reference number is required server-side too) — Place Order/Complete Sale
  // stayed enabled with both empty and silently submitted ref_no: '' with no bank_pos.
  modeCode: z.string().optional().default(''),
  // Stable discriminator for a credit-style mode fetched from OrnaVerse
  // (currently only Nector Loyalty) — see paymentModeRules.js's own header
  // for why this must be checked here too, not just in the UI.
  modeType: z.number().nullable().optional().default(null),
  bankPosId: z.number().nullable().optional().default(null),
  refNo: z.string().optional().default(''),
  // Shape comes straight from a POSReceiptsSelect/List row, not this app's own —
  // loosely typed deliberately rather than re-declaring OrnaVerse's receipt schema.
  creditRef: z.any().nullable().optional().default(null),
}).superRefine((mode, ctx) => {
  // Shared with CheckoutPaymentSection's own copy — see that file's
  // requiresBank and paymentModeRules.js's header for why this must not be
  // a second, independently-maintained copy of the same rule.
  if (!paymentRequiresBank(mode)) return;

  if (mode.bankPosId == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Select a bank account for ${mode.modeName}`,
      path: ['bankPosId'],
    });
  }
  if (!mode.refNo || !mode.refNo.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Enter a reference number for ${mode.modeName}`,
      path: ['refNo'],
    });
  }
});

export const checkoutSchema = z
  .object({
    customerId: z
      .number({ message: 'A customer must be attached before placing the order' })
      .nullable()
      .refine((val) => val !== null, {
        message: 'A customer must be attached before placing the order',
      }),

    // Confirmed against the vendor's own POS Sale screen, which requires this too.
    salesPersonId: z
      .number({ message: 'Select a sales person before placing the order' })
      .nullable()
      .refine((val) => val !== null, {
        message: 'Select a sales person before placing the order',
      }),

    // Emptiness is checked in superRefine, not here: an ORDER may legitimately be
    // placed with no payment at all (advance is optional). An INVOICE needs one.
    paymentModes: z.array(paymentModeSchema),

    totalAmount: z.number().nonnegative(),

    cartTotal: z.number().nonnegative(),

    // Already-on-file or freshly-entered-and-valid PAN — null is fine below
    // the statutory threshold, required above it.
    panNumber: z.string().nullable(),

    allowPartialPayment: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    const paidTotal = data.paymentModes.reduce((sum, p) => sum + p.amount, 0);

    // Allow up to 1 paisa of float rounding drift throughout.
    if (data.allowPartialPayment) {
      // Zero is fine — the whole value is then carried as balance_amount and
      // collected when the piece is handed over.
      if (paidTotal > data.cartTotal + 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Advance cannot be more than the order total',
          path: ['paymentModes'],
        });
      }
      return;
    }

    if (data.paymentModes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select at least one payment mode',
        path: ['paymentModes'],
      });
      return;
    }

    if (Math.abs(paidTotal - data.cartTotal) >= 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Payment amounts must add up to the order total',
        path: ['paymentModes'],
      });
    }
  })
  .refine(
    (data) => Math.abs(data.totalAmount - data.cartTotal) < 0.01,
    {
      message: 'Order total mismatch — please refresh and try again',
      path: ['totalAmount'],
    }
  )
  .refine(
    (data) => {
      if (data.totalAmount <= APP_CONFIG.COMPLIANCE.PAN_MANDATORY_THRESHOLD) return true;
      return !!data.panNumber && PAN_REGEX.test(data.panNumber);
    },
    {
      message: `PAN is mandatory for orders above ₹${APP_CONFIG.COMPLIANCE.PAN_MANDATORY_THRESHOLD.toLocaleString('en-IN')}`,
      path: ['panNumber'],
    }
  );