import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { clearPendingOrderPromos, selectPendingOrderPromoCodes, selectAppliedPromos } from '@/store/slices/cartSlice';
import { usePromoValidation } from '@/hooks/checkout/usePromoValidation';

/**
 * Billing an order re-applies the order's own offers, as OrnaVerse does (e.g. BO1-RPO-10-26-00012 → BO1-LJ-1126-021):
 * the free gold coins promised on the order are claimed from stock on the invoice.
 */
export function useCarryOverOrderPromos({ invoice, order, isPricing }) {
  const dispatch = useDispatch();
  const pending = useSelector(selectPendingOrderPromoCodes);
  const applied = useSelector(selectAppliedPromos);
  const { validatePromo } = usePromoValidation({ invoice, order });
  const ready = !isPricing && !!(invoice?.lineItems?.length || order?.lineItems?.length);

  useEffect(() => {
    if (!pending.length || !ready) return;
    dispatch(clearPendingOrderPromos());
    const appliedCodes = new Set(applied.map((p) => p.promoCode?.toUpperCase()));
    pending
      .filter((code) => !appliedCodes.has(code.toUpperCase()))
      .forEach((code) => validatePromo({ promoCode: code }));
  }, [pending, ready, applied, dispatch, validatePromo]);
}
