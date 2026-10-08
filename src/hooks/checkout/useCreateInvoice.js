import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { createInvoice, postInvoice } from '@/services/orderService';
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
import { roundToNearestRupee } from '@/lib/priceUtils';
import { selectActiveStoreId, selectActiveStoreCode, selectActiveStoreName } from '@/store/slices/storeSlice';
import { selectCartCustomerAddress } from '@/store/slices/cartSlice';
import APP_CONFIG from '@/constants/appConfig';
import TOAST from '@/constants/toastMessages';
import { trackDocumentPlaced, trackDocumentFailed } from '@/lib/analytics/orderTracking';

/**
 * Builds InvoiceRow Entity from already-priced line items + session state.
 * Field names confirmed against OrnaVerse.POS.InvoiceRow +
 * OrnaVerse.POS.InvoiceItemsRow + OrnaVerse.POS.InvoiceReceiptRow (v1.json).
 *
 * @param {{
 *   lineItems:      object[], // buildPricedLineItems() output
 *   discount:       number,
 *   customerId:     number,
 *   customerName:   string,
 *   customerMobile: string,
 *   activeStoreId:  number,
 *   paymentModes:   { modeId, modeCode, modeName, amount }[],
 *   narration?:     string,
 *   salesPersonId:  number,
 *   exchangeRate:   number,
 *   headerConfig:   ReturnType<typeof useOrderHeaderConfig>,
 *   fulfillmentOrderNo?: string, // "Fulfill from order" — narration only, see below
 * }} params
 */
function buildInvoiceEntity({
  lineItems, promotionDetails,
  customerId, customerName, customerMobile,
  activeStoreId,
  paymentModes, narration,
  salesPersonId, exchangeRate,
  headerConfig,
  fulfillmentOrderNo,
}) {
  const today = localDocumentDate();
  const {
    subTotal, discount, taxableAmount, taxAmount, netAmount,
    pieces, weight, netWeight,
  } = summarizeLineItems(lineItems);
  const roundedNet = roundToNearestRupee(netAmount);
  const round_off  = +(roundedNet - netAmount).toFixed(2);

  const receipt_details = buildReceiptDetails({
    paymentModes, customerId, activeStoreId, exchangeRate, headerConfig,
  });
  const receiptAmount = +receipt_details.reduce((s, r) => s + (r.amount ?? 0), 0).toFixed(2);
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
    balance_amount: +(roundedNet - receiptAmount).toFixed(2),
    narration:     combinedNarration,
    document_id:                 APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE,
    financial_year_id:           headerConfig.financialYearId,
    ledger_id:                   headerConfig.ledgerId,
    is_tax_applicable:           headerConfig.isTaxApplicable,
    auto_posting:                headerConfig.autoPosting,
    is_document_number_editable: headerConfig.isDocumentNumberEditable,
    allow_backdated_entry:       false,
    // From the document type's own config, not hardcoded.
    number_of_backdated_days:    headerConfig.numberOfBackdatedDays ?? 0,
    is_einvoice:                 false,
    line_items: lineItems,
    receipt_details,
    promotion_details: promotionDetails ?? [],
  };
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { items, appliedPromos, fulfillmentOrderNo } = useCart();
  const { total: cartTotal } = useCartTotals();
  const { customerId, customerName, customerMobile } = useCustomerSession();
  const customerAddress = useSelector(selectCartCustomerAddress);
  const activeStoreId   = useSelector(selectActiveStoreId);
  const activeStoreCode = useSelector(selectActiveStoreCode);
  const activeStoreName = useSelector(selectActiveStoreName);
  const { exchangeRate } = useExchangeRate();
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE);

  const mutation = useMutation({
    /**
     * @param {{
     *   paymentModes:  { modeId, modeCode, modeName, amount, ledgerId?, raw? }[],
     *   narration?:    string,
     *   salesPersonId: number,
     *   pricedLineItems?:  object[],  // post-promotion lines from useCheckoutPricing
     *   promotionDetails?: object[],  // its invoice_promotions rows
     * }} params
     */
    mutationFn: async ({
      paymentModes, narration, salesPersonId, pricedLineItems,
      promotionDetails: promotionDetailsArg,
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

      const documentId = APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE;
      let lineItems;
      let promotionDetails;

      if (pricedLineItems) {
        lineItems = pricedLineItems.map((row) => ({ ...row, sales_person_id: salesPersonId }));
        promotionDetails = promotionDetailsArg ?? [];
      } else {
        const split = await buildPricedLineItems({ items, activeStoreId, salesPersonId });
        if (!split.invoice) {
          throw new Error('Nothing in this cart is currently in stock — an invoice needs at least one real stock piece.');
        }
        const promoted = await applyPromotionsToLines({
          lineItems: split.invoice.lineItems, appliedPromos, documentId, exchangeRate,
        });
        lineItems = promoted.lineItems;
        promotionDetails = promoted.promotionDetails;
      }

      const entity = buildInvoiceEntity({
        lineItems, promotionDetails,
        customerId, customerName, customerMobile,
        activeStoreId,
        paymentModes, narration,
        salesPersonId, exchangeRate,
        headerConfig,
        fulfillmentOrderNo,
      });

      // Step 1: Create draft invoice.
      // `stage` is stamped on the error so create-vs-post failures can be
      // told apart reliably (rather than sniffing the error message).
      let createResponse;
      try {
        createResponse = await createInvoice(entity);
      } catch (err) {
        err.stage = 'create';
        throw err;
      }
      const transactionId = createResponse?.EntityId;

      if (!transactionId) {
        const err = new Error('Invoice creation failed — no EntityId returned');
        err.stage = 'create';
        throw err;
      }

      // Step 2: Post (finalise) — triggers stock deduction + accounting.
      // Skipped when the document type auto-posts: with auto_posting:true
      // (how this store's POS document types are configured), Create already
      // posts, and a follow-up Post fails with {"Code":"AlreadyPosted"} —
      // which would surface as a failed sale to the operator.
      let postResponse = null;
      if (!headerConfig.autoPosting) {
        try {
          postResponse = await postInvoice(transactionId);
        } catch (err) {
          err.stage = 'post';
          err.transactionId = transactionId;
          throw err;
        }
      }

      // entity + lineItems travel back (not just netAmount) so onSuccess can
      // report the full order — price breakup, per-item detail — not just
      // the total.
      return { transactionId, createResponse, postResponse, entity, lineItems };
    },

    onSuccess: ({ transactionId, entity, lineItems }, variables) => {
      toast.success(TOAST.INVOICES.CREATED(transactionId));

      trackDocumentPlaced({
        documentType: 'invoice',
        transactionId, entity, lineItems,
        customerId, customerName, customerMobile, customerAddress,
        activeStoreId, activeStoreCode, activeStoreName,
        paymentModes:    variables?.paymentModes,
        salesPersonId:   variables?.salesPersonId,
        salesPersonName: variables?.salesPersonName,
      });

      // Not clearing the cart here — that resets the attached customer, and
      // the checkout screen's own redirect guards are only switched off once
      // `invoiceResult` is set (one render later), so clearing here would
      // bounce the operator to /cart before they see the confirmation
      // screen. The screen clears the cart itself once shown.
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      // Only invalidate orders for a "Fulfill from order" sale — that's the
      // only case where placing an invoice also changes an order's state
      // (closes the source order server-side).
      if (fulfillmentOrderNo) {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }
    },

    onError: (error, variables) => {
      console.error('[useCreateInvoice]', error);

      const failedAtPost = error?.stage === 'post';
      // Nothing was invoiced, so report what the counter was trying to
      // collect rather than the cart's unrelated estimate.
      const attemptedValue = variables?.paymentModes
        ?.reduce((sum, p) => sum + (p.amount ?? 0), 0) ?? cartTotal;
      // normalizeError (lib/axios/interceptors.js) lifts OrnaVerse's own
      // Error.Message onto serverMessage — show it, since it names the
      // actual problem (e.g. an out-of-stock SKU) rather than a generic retry prompt.
      const reason = error?.serverMessage ?? error?.message ?? null;

      trackDocumentFailed({
        documentType: 'invoice',
        stage: failedAtPost ? 'post' : 'create',
        value: attemptedValue,
        error: reason ?? 'unknown',
      });

      // If create succeeded but post failed, the draft sits on the server —
      // naming that transactionId matters more than the raw Post error, so
      // it wins over `reason` here.
      if (failedAtPost && error?.transactionId) {
        toast.error(TOAST.INVOICES.POST_FAILED(error.transactionId));
        return;
      }

      toast.error(reason ?? TOAST.INVOICES.CREATE_FAILED);
    },
  });

  return {
    placeInvoice:    mutation.mutateAsync,
    isPlacingInvoice:mutation.isPending,
    invoiceResult:   mutation.data,
    error:           mutation.error,
    reset:           mutation.reset,
  };
}