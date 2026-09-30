// src/hooks/checkout/useCreateOrder.js
// POS Order creation — native POS/Order/Create → POS/Order/Post flow.
//
// TWO DOCUMENTS, chosen for the operator rather than by them — the checkout
// screen has no mode selector; what the customer pays decides which is
// raised (see checkout/page.jsx):
//   • Invoice (54) — everything in stock AND settled in full (OrnaVerse
//     rejects a short-paid invoice, or one with insufficient stock).
//   • Order (53) — anything else: an advance, nothing collected, or a
//     made-to-order piece; the remainder rides as balance_amount. Order does
//     not check stock, unlike Invoice.
// The two documents are not interchangeable — raising both for one sale
// would double-count it, so checkout raises exactly one. See useCreateInvoice.js
// for the Invoice flow.
//
// Note: keep this hook wired to a real caller — if checkout ever raises only
// invoices, POS/Order/Create stops being called at all and the Orders screen
// silently goes stale (it looks like orders stopped saving, when really
// they're just being filed as invoices instead).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { createOrder, postOrder } from '@/services/orderService';
import {
  buildPricedLineItems,
  applyPromotionsToLines,
  summarizeLineItems,
} from '@/services/checkoutPricingService';
import { localDocumentDate, buildReceiptDetails } from '@/lib/checkout/documentFields';
import { useCart } from '@/hooks/cart/useCart';
import { useCartTotals } from '@/hooks/cart/useCartTotals';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { useExchangeRate } from '@/hooks/checkout/useExchangeRate';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { selectActiveStoreId, selectActiveStoreCode, selectActiveStoreName } from '@/store/slices/storeSlice';
import { selectCartCustomerAddress } from '@/store/slices/cartSlice';
import APP_CONFIG from '@/constants/appConfig';
import TOAST from '@/constants/toastMessages';
import { trackDocumentPlaced, trackDocumentFailed } from '@/lib/analytics/orderTracking';

/**
 * Builds the OrderRow Entity payload from cart state. Same schema and
 * header-field rationale as useCreateInvoice.js's buildInvoiceEntity — see
 * its header comment for the full story.
 */
function buildOrderEntity({
  lineItems, promotionDetails,
  customerId, customerName, customerMobile,
  activeStoreId, paymentModes, narration,
  salesPersonId, exchangeRate, headerConfig,
  fulfillmentOrderNo,
}) {
  const today = localDocumentDate();
  const {
    subTotal, discount, taxableAmount, taxAmount, netAmount,
    pieces, weight, netWeight,
  } = summarizeLineItems(lineItems);

  // Summed straight from the lines, which ApplyPromotions already discounted
  // and re-taxed.
  const roundedNet = Math.round(netAmount);
  const round_off  = +(roundedNet - netAmount).toFixed(2);

  const receipt_details = buildReceiptDetails({
    paymentModes, customerId, activeStoreId, exchangeRate, headerConfig,
  });
  const receiptAmount = +receipt_details.reduce((s, r) => s + (r.amount ?? 0), 0).toFixed(2);

  // "Fulfill from order" — same narration-only audit trail as the Invoice
  // path; see useCreateInvoice.js.
  const fulfillmentNote = fulfillmentOrderNo ? `Fulfilled from Order ${fulfillmentOrderNo}` : null;
  const combinedNarration = [fulfillmentNote, narration].filter(Boolean).join(' — ') || undefined;

  return {
    party_id:      customerId,
    party_name:    customerName ?? undefined,
    mobile:        customerMobile ?? undefined,
    user_id:       null,
    company_id:    activeStoreId,
    document_date: today,
    currency_id:   APP_CONFIG.CURRENCY.INR_ID,
    exchange_rate: exchangeRate,
    employee_id:      salesPersonId,
    sales_person_id:  salesPersonId,
    pieces, weight, net_weight: netWeight,
    sub_total:      subTotal,
    discount:       discount ?? 0,
    taxable_amount: taxableAmount,
    tax_amount:     taxAmount,
    net_amount:     roundedNet,
    base_sub_total: subTotal,
    base_net_amount: roundedNet,
    base_tax_amount: taxAmount,
    round_off,
    receipt_amount: receiptAmount,
    // Positive on an order taken with an advance — that is the balance the
    // customer settles on collection, not an error.
    balance_amount: +(roundedNet - receiptAmount).toFixed(2),
    narration:     combinedNarration,
    document_id:                 APP_CONFIG.DOCUMENT_TYPES.POS_ORDER,
    financial_year_id:           headerConfig.financialYearId,
    ledger_id:                   headerConfig.ledgerId,
    is_tax_applicable:           headerConfig.isTaxApplicable,
    auto_posting:                headerConfig.autoPosting,
    is_document_number_editable: headerConfig.isDocumentNumberEditable,
    allow_backdated_entry:       false,
    number_of_backdated_days:    headerConfig.numberOfBackdatedDays ?? 0,
    is_einvoice:                 false,
    line_items: lineItems,
    receipt_details,
    // The invoice_promotions[] rows from Helper/ApplyPromotions, passed
    // through untouched.
    promotion_details: promotionDetails ?? [],
  };
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  const { items, appliedPromos, fulfillmentOrderNo } = useCart();
  // Fallback for analytics only on a failed order — see useCreateInvoice.js.
  const { total: cartTotal } = useCartTotals();
  const { customerId, customerName, customerMobile } = useCustomerSession();
  const customerAddress = useSelector(selectCartCustomerAddress);
  const activeStoreId   = useSelector(selectActiveStoreId);
  const activeStoreCode = useSelector(selectActiveStoreCode);
  const activeStoreName = useSelector(selectActiveStoreName);
  const { exchangeRate } = useExchangeRate();
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.POS_ORDER);

  const mutation = useMutation({
    /**
     * @param {{
     *   paymentModes:  {modeId, modeCode, modeName, amount, ledgerId?, raw?}[],
     *   salesPersonId: number,
     *   pricedLineItems?:  object[],  // post-promotion lines from useCheckoutPricing
     *   promotionDetails?: object[],  // its invoice_promotions rows
     *   narration?:    string,
     * }} params
     */
    mutationFn: async ({
      paymentModes, salesPersonId, pricedLineItems,
      promotionDetails: promotionDetailsArg, narration,
    }) => {
      if (!headerConfig.isReady) {
        if (headerConfig.isError) headerConfig.refetch();
        throw new Error(
          headerConfig.isConfigMissing
            ? "This document type isn't set up for your store yet — contact OrnaVerse support"
            : headerConfig.isError
              ? 'Store configuration failed to load — retrying now, please try again in a moment'
              : 'Store configuration is still loading — please try again in a moment'
        );
      }

      const documentId = APP_CONFIG.DOCUMENT_TYPES.POS_ORDER;

      // Reuse the lines checkout already priced and quoted from, exactly as
      // the invoice flow does — see useCreateInvoice.js.
      let lineItems;
      let promotionDetails;

      if (pricedLineItems) {
        lineItems = pricedLineItems.map((row) => ({ ...row, sales_person_id: salesPersonId }));
        promotionDetails = promotionDetailsArg ?? [];
      } else {
        // buildPricedLineItems decides ONE document type for the whole cart
        // (see its own header); this fallback path (no pre-priced lines
        // supplied) is Order-only, so it fails outright if the cart came
        // back as an Invoice instead (every item was fully in stock).
        const split = await buildPricedLineItems({ items, activeStoreId, salesPersonId });
        if (!split.order) {
          throw new Error('Every item in this cart is in stock — this should be raised as an invoice, not an order.');
        }
        const promoted = await applyPromotionsToLines({
          lineItems: split.order.lineItems, appliedPromos, documentId, exchangeRate,
        });
        lineItems = promoted.lineItems;
        promotionDetails = promoted.promotionDetails;
      }

      const entity = buildOrderEntity({
        lineItems, promotionDetails,
        customerId, customerName, customerMobile,
        activeStoreId, paymentModes, narration,
        salesPersonId, exchangeRate, headerConfig,
        fulfillmentOrderNo,
      });

      // Step 1: Create draft order. `stage` is stamped on the error so the
      // handler can tell create from post without sniffing the message.
      let createResponse;
      try {
        createResponse = await createOrder(entity);
      } catch (err) {
        err.stage = 'create';
        throw err;
      }
      const transactionId = createResponse?.EntityId;

      if (!transactionId) {
        const err = new Error('Order creation failed — no EntityId returned');
        err.stage = 'create';
        throw err;
      }

      // Step 2: Post (finalise) — skipped when the document type auto-posts.
      // With auto_posting:true, Create already posts and a follow-up Post
      // returns {"Code":"AlreadyPosted"}, which would surface as a failed order.
      let postResponse = null;
      if (!headerConfig.autoPosting) {
        try {
          postResponse = await postOrder(transactionId);
        } catch (err) {
          err.stage = 'post';
          err.transactionId = transactionId;
          throw err;
        }
      }
      // entity + lineItems travel back so onSuccess can report the full
      // order — price breakup, per-item detail — not just the total.
      return { transactionId, createResponse, postResponse, entity, lineItems };
    },

    onSuccess: ({ transactionId, entity, lineItems }, variables) => {
      toast.success(TOAST.ORDERS.CREATED(transactionId));

      // An Order is a real completed step in the funnel (a deposit/reserve
      // taken), just not a fully-paid sale, so it's tagged document_type:
      // 'order' to stay distinguishable from useCreateInvoice.js's immediate sales.
      trackDocumentPlaced({
        documentType: 'order',
        transactionId, entity, lineItems,
        customerId, customerName, customerMobile, customerAddress,
        activeStoreId, activeStoreCode, activeStoreName,
        paymentModes:    variables?.paymentModes,
        salesPersonId:   variables?.salesPersonId,
        salesPersonName: variables?.salesPersonName,
      });

      // Not clearing the cart here — same reason as useCreateInvoice.js.
      // The screen clears it once the confirmation is on screen.
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },

    onError: (error, variables) => {
      console.error('[useCreateOrder]', error);

      const failedAtPost = error?.stage === 'post';
      // Nothing was saved, so report what the counter was trying to
      // collect/reserve rather than the cart's unrelated estimate.
      const attemptedValue = variables?.paymentModes
        ?.reduce((sum, p) => sum + (p.amount ?? 0), 0) ?? cartTotal;
      const reason = error?.serverMessage ?? error?.message ?? null;

      trackDocumentFailed({
        documentType: 'order',
        stage: failedAtPost ? 'post' : 'create',
        value: attemptedValue,
        error: reason ?? 'unknown',
      });

      // A post-stage failure means Create already succeeded — a real draft
      // order sits server-side under error.transactionId, which matters more
      // than the raw Post error, so it wins here.
      if (failedAtPost && error?.transactionId) {
        toast.error(TOAST.ORDERS.POST_FAILED(error.transactionId));
        return;
      }

      toast.error(reason ?? TOAST.ORDERS.CREATE_FAILED);
    },
  });

  return {
    placeOrder:    mutation.mutateAsync,
    isPlacingOrder:mutation.isPending,
    orderResult:   mutation.data,
    error:         mutation.error,
    reset:         mutation.reset,
  };
}