'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { ShieldCheck, Package, Receipt, CreditCard, UserCog } from 'lucide-react';
import ConfirmDialog    from '@/components/shared/ConfirmDialog';
import CheckoutCustomerSummary  from '@/components/features/checkout/CheckoutCustomerSummary';
import CheckoutPanCapture       from '@/components/features/checkout/CheckoutPanCapture';
import DiscountSection          from '@/components/features/checkout/DiscountSection';
import CheckoutPaymentSection   from '@/components/features/checkout/CheckoutPaymentSection';
import CheckoutTrustStrip       from '@/components/features/checkout/CheckoutTrustStrip';
import SalesPersonSelect        from '@/components/features/checkout/SalesPersonSelect';
import { useSalesPersonOptions } from '@/hooks/schemes/useSalesPersonOptions';
import CartItemRow              from '@/components/features/cart/CartItemRow';
import CartSummary              from '@/components/features/cart/CartSummary';
import PlaceOrderButton         from '@/components/features/checkout/PlaceOrderButton';
import { useCart }                    from '@/hooks/cart/useCart';
import { useCartTotals }              from '@/hooks/cart/useCartTotals';
import { useCustomerSession }         from '@/hooks/customer/useCustomerSession';
import { useRedirectOnCustomerChange } from '@/hooks/checkout/useRedirectOnCustomerChange';
import { useCreateInvoice }           from '@/hooks/checkout/useCreateInvoice';
import { useCreateOrder }             from '@/hooks/checkout/useCreateOrder';
import { useCheckoutPricing }         from '@/hooks/checkout/useCheckoutPricing';
import { buildCartDisplayRows, getPromoBreakdown } from '@/services/checkoutPricingService';
import { useBackGuard } from '@/contexts/NavigationGuardContext';
import { useSmartBack }  from '@/hooks/navigation/useSmartBack';
import { checkoutSchema }             from '@/validators/checkoutSchema';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { setCheckoutInProgress } from '@/store/slices/uiSlice';
import tracker from '@/lib/analytics/tracker';
import EVENTS, { GA_ECOMMERCE_EVENTS } from '@/lib/analytics/events';
import { formatAmount } from '@/lib/priceUtils';
import APP_CONFIG from '@/constants/appConfig';

const { LOYALTY_MODE_TYPE } = APP_CONFIG.PAYMENT_MODES;

function CheckoutScreen() {
  const router  = useRouter();
  const dispatch = useDispatch();
  const { items, appliedPromos, isEmpty, clearCartKeepCustomer, removeItem } = useCart();
  const { total }          = useCartTotals();
  const { customerId, customerMobile } = useCustomerSession();
  const activeStoreId      = useSelector(selectActiveStoreId);
  const { goBack, clearGuard } = useSmartBack();

  const {
    placeInvoice,
    isPlacingInvoice,
  } = useCreateInvoice();

  const {
    placeOrder,
    isPlacingOrder,
  } = useCreateOrder();

  const {
    invoice, order,
    isLoading: isPricing,
    error: pricingError,
  } = useCheckoutPricing();
  const doc = invoice ?? order;
  const hasDoc = !!doc;
  const documentType = invoice ? 'invoice' : 'order';
  const discountBreakdown = getPromoBreakdown(appliedPromos, doc?.promotionDetails ?? []);

  const [payments, setPayments] = useState([]);
  const [salesPersonId, setSalesPersonId] = useState(null);
  const { salesPersons } = useSalesPersonOptions(activeStoreId);
  const salesPersonName = salesPersons.find((p) => p.employee_id === salesPersonId)?.employee_name ?? null;
  const [panNumber, setPanNumber]     = useState(null);
  const [panDocument, setPanDocument] = useState(null);
  const [isBackConfirmOpen, setIsBackConfirmOpen] = useState(false);
  const [isPaymentConfirmOpen, setIsPaymentConfirmOpen] = useState(false);

  const displayRows = useMemo(
    () => buildCartDisplayRows(items, { invoice, order }),
    [items, invoice, order]
  );

  const amountCollected = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const isSubmitting = isPlacingInvoice || isPlacingOrder;
  const payableTotal = doc?.amountDue ?? 0;
  const creditApplied = payments.find((p) => p.modeType === LOYALTY_MODE_TYPE)?.amount ?? 0;
  const [isConfirmed, setIsConfirmed] = useState(false);

  const backGuard = useCallback(() => {
    if (items.length > 0 && !isConfirmed) {
      setIsBackConfirmOpen(true);
      return false;
    }
    return true;
  }, [items.length, isConfirmed]);
  useBackGuard(backGuard);

  const handleConfirmLeave = () => {
    clearGuard();
    setIsBackConfirmOpen(false);
    goBack();
  };
  useRedirectOnCustomerChange(!isConfirmed);

  useEffect(() => {
    if (isEmpty && !isConfirmed) {
      router.replace('/cart');
    }
  }, [isEmpty, isConfirmed, router]);

  useEffect(() => {
    if (isEmpty) return;
    tracker.trackEcommerce(GA_ECOMMERCE_EVENTS.BEGIN_CHECKOUT, EVENTS.CHECKOUT_STARTED, {
      value:    total,
      currency: 'INR',
      items:    items.map((item) => ({
        item_id:           String(item.itemId),
        item_name:         item.itemName,
        item_sku:          item.sku,
        item_category:     item.attributes?.category ?? null,
        item_sub_category: item.attributes?.sub_category ?? null,
        item_brand:        item.attributes?.brand ?? null,
        item_collection:   item.attributes?.collection ?? null,
        item_karat:        item.attributes?.karat ?? null,
        item_metal:        item.attributes?.metal ?? null,
        item_color:        item.attributes?.metal_color ?? null,
        item_size:         item.sizeName ?? item.attributes?.size_name ?? null,
        item_weight:       item.attributes?.net_weight ?? item.attributes?.gross_weight ?? null,
        gemstone_type:     item.attributes?.gemstone_type ?? null,
        gemstone_color:    item.attributes?.gemstone_color ?? null,
        price:     item.unitPrice,
        quantity:  item.quantity,
      })),
    });
  }, []);

  useEffect(() => {
    if (isConfirmed) return;
    const handleBeforeUnload = (e) => {
      if (items.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [items.length, isConfirmed]);
  const validation = hasDoc ? checkoutSchema.safeParse({
    customerId, salesPersonId,
    paymentModes: payments,
    totalAmount:  doc.amountDue,
    cartTotal:    doc.amountDue,
    panNumber,
    panDocument,
    allowPartialPayment: documentType === 'order',
  }) : { success: true };

  const isValid = validation.success && hasDoc && !isPricing && !pricingError;

  const handlePlaceOrderClick = () => {
    if (!isValid || isSubmitting) return;
    setIsPaymentConfirmOpen(true);
  };
  const handlePaymentConfirmed = async () => {
    dispatch(setCheckoutInProgress(true));

    try {
      const outcome = documentType === 'invoice'
        ? await placeInvoice({
            paymentModes: payments, salesPersonId, salesPersonName,
            pricedLineItems: invoice.lineItems, promotionDetails: invoice.promotionDetails,
          })
        : await placeOrder({
            paymentModes: payments, salesPersonId, salesPersonName,
            pricedLineItems: order.lineItems, promotionDetails: order.promotionDetails,
          });

      dispatch(setCheckoutInProgress(false));
      setIsConfirmed(true);
      if (!isEmpty) clearCartKeepCustomer();
      router.replace(`/order-success?transactionId=${outcome.transactionId}&documentType=${documentType}`);
    } catch (error) {
      dispatch(setCheckoutInProgress(false));
      const message = error?.serverMessage ?? error?.message ?? null;
      const query = message ? `&message=${encodeURIComponent(message)}` : '';
      router.push(`/order-failed?reason=error${query}`);
    }
  };

  const handlePaymentDeclined = () => {
    tracker.track(EVENTS.PAYMENT_DECLINED, {
      documentType,
      value: amountCollected,
    });
    router.push('/order-failed?reason=declined');
  };

  if (isConfirmed) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
      </div>
    );
  }

  // ── Checkout form ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full pb-32 p-4 md:p-6">
      <p className="text-sm text-muted-foreground -mb-2">Review your order and complete the payment</p>

      <div className='grid grid-cols-1 items-start gap-5 lg:grid-cols-2'>
        <div className="flex flex-col gap-5 w-full">
          <CheckoutCustomerSummary />
          <CheckoutPanCapture
            key={customerId}
            totalAmount={payableTotal}
            onPanResolved={setPanNumber}
            onPanDocumentResolved={setPanDocument}
          />
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
              <UserCog size={16} className="text-accent shrink-0" aria-hidden="true" />
              Sales Person <span className="text-destructive">*</span>
            </h2>
            <SalesPersonSelect
              companyId={activeStoreId}
              value={salesPersonId}
              onChange={setSalesPersonId}
            />
          </section>
          <DiscountSection />
        </div>
        <div className="flex flex-col gap-5 w-full lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-12.5rem)] lg:overflow-y-auto">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-1 flex items-center gap-1.5">
              <Package size={16} className="text-accent shrink-0" aria-hidden="true" />
              Order Items <span className="text-muted-foreground font-normal text-xs">({displayRows.length} item{displayRows.length !== 1 ? 's' : ''})</span>
            </h2>
            <div>
              {displayRows.map((row) => (
                <CartItemRow
                  key={row.key}
                  item={row.item}
                  displayQuantity={row.displayQuantity}
                  readOnly
                  onRemove={removeItem}
                  priced={row.priced}
                  showPriceBreakdown
                  showComponentDetails
                  showStockAcrossStores
                />
              ))}
            </div>
          </section>

          {hasDoc && (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-bold text-foreground mb-1 flex items-center gap-1.5">
                <Receipt size={16} className="text-accent shrink-0" aria-hidden="true" />
                Order Summary
              </h2>
              <CartSummary
                totals={doc.totals}
                isPricing={isPricing}
                creditApplied={creditApplied}
                discountBreakdown={discountBreakdown}
              />
            </section>
          )}

          {hasDoc && (
            <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <CreditCard size={16} className="text-accent shrink-0" aria-hidden="true" />
                Payment
              </h2>
              <CheckoutPaymentSection
                key={`payment-${customerId}`}
                bare
                amountDue={payableTotal}
                allowPartial={documentType === 'order'}
                lineItems={doc.lineItems ?? []}
                onChange={setPayments}
              />
            </section>
          )}

          {!isPricing && documentType === 'order' && hasDoc && (
            <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              Not in stock at this store — this will be booked as an order and
              billed when the piece arrives.
            </p>
          )}

          {isPricing && (
            <p className="text-xs text-muted-foreground">
              Pricing items against today&apos;s rates…
            </p>
          )}
          {pricingError && (
            <p className="text-sm text-status-error">
              {pricingError.serverMessage ?? pricingError.message}
            </p>
          )}
        </div>
      </div>
      
      <CheckoutTrustStrip />
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card p-4 shadow-lg md:px-6">
        <div className="max-w-6xl mx-auto w-full flex flex-col items-center gap-2">
          <PlaceOrderButton
            isValid={isValid}
            isPlacingOrder={isSubmitting}
            onPlaceOrder={handlePlaceOrderClick}
            amountDue={payableTotal}
            amountCollected={amountCollected}
            creditApplied={creditApplied}
            isPricing={isPricing}
            documentType={documentType}
          />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck size={13} className="text-accent" aria-hidden="true" />
            Secure checkout · Your data is safe with us
          </p>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isBackConfirmOpen}
        onOpenChange={setIsBackConfirmOpen}
        title="Leave checkout?"
        description="Your cart items will be kept, but any payment selections you've made here will be lost."
        confirmLabel="Leave"
        cancelLabel="Stay"
        confirmVariant="destructive"
        onConfirm={handleConfirmLeave}
      />
      
      <ConfirmDialog
        isOpen={isPaymentConfirmOpen}
        onOpenChange={setIsPaymentConfirmOpen}
        title="Confirm payment on terminal"
        description={
          documentType === 'order'
            ? `Has the advance of ${formatAmount(amountCollected)} been completed on the payment terminal? Confirming will place the order — declining will not save anything.`
            : `Has the payment of ${formatAmount(payableTotal)} been completed on the payment terminal? Confirming will generate the invoice — declining will not save anything.`
        }
        confirmLabel="Yes, Payment Received"
        cancelLabel="No, Declined"
        confirmVariant="default"
        onConfirm={handlePaymentConfirmed}
        onCancel={handlePaymentDeclined}
      />

    </div>
  );
}

export default function CheckoutPage() {
  return <CheckoutScreen />;
}