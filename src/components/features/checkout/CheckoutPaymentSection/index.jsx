'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { usePaymentModes } from '@/hooks/checkout/usePaymentModes';
import { useBankPosAccounts } from '@/hooks/checkout/useBankPosAccounts';
import { useInvoiceHelpers } from '@/hooks/checkout/useInvoiceHelpers';
import { useCustomerSession } from '@/hooks/customer/useCustomerSession';
import { useNectorCheckoutInfo } from '@/hooks/checkout/useNectorCheckoutInfo';
import { useSelector } from 'react-redux';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import PaymentModeSelector from '../PaymentModeSelector';
import PaymentAmountInput from '../PaymentAmountInput';
import BankPosSelect from '../BankPosSelect';
import { paymentRequiresBank } from '@/lib/checkout/paymentModeRules';
import APP_CONFIG from '@/constants/appConfig';
import tracker from '@/lib/analytics/tracker';
import EVENTS from '@/lib/analytics/events';

const { LOYALTY_MODE_TYPE } = APP_CONFIG.PAYMENT_MODES;

function HelperBalanceRow({ label, amount, modeCode, rows, isApplied, onToggle, isLoading }) {
  if (isLoading) return null;
  if (!amount || amount <= 0) return null;

  const handleToggle = () => onToggle({ modeCode, label, amount, rows });
  return (
    <div
      role="switch"
      aria-checked={isApplied}
      tabIndex={0}
      onClick={handleToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle();
        }
      }}
      className={`
        flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left
        transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        ${isApplied ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted'}
      `}
    >
      <div>
        <p className="text-xs font-medium text-foreground/80">{label}</p>
        <p className="text-sm font-semibold text-primary mt-0.5">
          {APP_CONFIG.CURRENCY.INR_SYMBOL}{Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </p>
      </div>
      <Switch checked={isApplied} className="pointer-events-none" tabIndex={-1} aria-hidden="true" />
    </div>
  );
}

/**
 *
 * @param {{
 *   onChange: (payments: object[]) => void,
 *   amountDue?: number, allowPartial?: boolean,
 *   lineItems?: object[], bare?: boolean,
 * }} props
 */
export default function CheckoutPaymentSection({
  onChange, amountDue = 0, allowPartial = false, lineItems = [], bare = false,
}) {
  const total = amountDue;
  const { paymentModes, isLoading: modesLoading, isError: modesError } = usePaymentModes();
  const { bankPosAccounts } = useBankPosAccounts();
  const { customerId, customerMobile } = useCustomerSession();
  const activeStoreId  = useSelector(selectActiveStoreId);

  const helpers = useInvoiceHelpers({
    partyId:   customerId,
    companyId: activeStoreId,
  });
  const loyaltyMode = paymentModes.find((m) => m.modeType === LOYALTY_MODE_TYPE) ?? null;
  const {
    promotion: loyaltyPromotion, isEligible: loyaltyEligible,
    isLoading: loyaltyEligibilityLoading, ineligibleReason,
  } = useNectorCheckoutInfo(
    {
      mobile: customerMobile, companyId: activeStoreId, partyId: customerId,
      netAmount: total, remainingDue: total, lineItems,
    },
    { enabled: !!customerMobile && !!customerId && !!activeStoreId && total > 0 }
  );
  const loyaltyClaimable = (Number(loyaltyPromotion?.coin_value) || 0)
    + (Number(loyaltyPromotion?.credit_value) || 0);
  const loyaltyDisabledReason = !customerMobile
    ? 'Attach a customer to redeem Nector Loyalty'
    : total <= 0
    ? 'Still pricing your cart'
    : loyaltyEligibilityLoading
    ? 'Checking what’s redeemable on this order…'
    : !loyaltyEligible
    ? (ineligibleReason ?? 'Not redeemable on this order yet')
    : null;
  const [payments, setPayments] = useState([]);
  const [lastPricedTotal, setLastPricedTotal] = useState(total);
  const dailyCashTaken = helpers.dailyCash?.amount ?? 0;
  const cashHeadroom   = Math.max(0, APP_CONFIG.COMPLIANCE.CASH_DAILY_LIMIT - dailyCashTaken);
  const isCashBlocked  = !helpers.dailyCash?.isLoading && cashHeadroom <= 0;

  const selectedModeIds = payments.filter((p) => p.modeId).map((p) => p.modeId);
  const appliedHelperCategories = [...new Set(
    payments.filter((p) => p.isHelper).map((p) => p.helperCategory)
  )];
  const requiresBank = paymentRequiresBank;

  const handleModeToggle = (modeId) => {
    setPayments((prev) => {
      const exists = prev.find((p) => p.modeId === modeId);
      if (exists) return prev.filter((p) => p.modeId !== modeId);

      const mode    = paymentModes.find((m) => m.modeId === modeId);
      const isLoyalty = mode?.modeType === LOYALTY_MODE_TYPE;
      if (isLoyalty && loyaltyClaimable <= 0) return prev;

      const nonHelperPaid = prev.filter((p) => !p.isHelper)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const helperPaid = prev.filter((p) => p.isHelper)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const remaining = Math.max(0, total - helperPaid - nonHelperPaid);
      const isFirst = prev.filter((p) => !p.isHelper && !p.isCredit).length === 0;

      tracker.track(EVENTS.PAYMENT_SELECTED, {
        modeId,
        modeCode: mode?.modeCode ?? null,
        modeName: mode?.modeName ?? null,
      });

      return [
        ...prev,
        {
          key:      modeId,
          modeId,
          modeCode: mode?.modeCode ?? '',
          modeName: mode?.modeName ?? 'Unknown',
          modeType: mode?.modeType ?? null,
          amount:   isLoyalty ? String(Math.min(remaining, loyaltyClaimable)) : (isFirst ? String(remaining) : ''),
          isHelper: false,
          isCredit: isLoyalty,
          nectorPromotion: isLoyalty ? loyaltyPromotion : null,
          bankPosId: null,
          refNo:    '',
        },
      ];
    });
  };
  function allocateCreditRows(rows, amountToApply) {
    const entries = [];
    let remaining = amountToApply;
    for (const row of rows ?? []) {
      if (remaining <= 0) break;
      const balance = Number(row.balance_amount) || 0;
      if (balance <= 0) continue;
      const take = Math.min(balance, remaining);
      entries.push({ row, amount: take });
      remaining -= take;
    }
    return entries;
  }

  const handleHelperToggle = ({ modeCode, label, amount, rows }) => {
    setPayments((prev) => {
      const exists = prev.some((p) => p.isHelper && p.helperCategory === modeCode);
      if (exists) return prev.filter((p) => !(p.isHelper && p.helperCategory === modeCode));
      const nonHelperPaid = prev.filter((p) => !p.isHelper)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const helperPaid = prev.filter((p) => p.isHelper)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const remaining = Math.max(0, total - helperPaid - nonHelperPaid);
      const applyAmount = Math.min(amount, remaining);
      const allocations = allocateCreditRows(rows, applyAmount);
      const entries = allocations.map(({ row, amount: rowAmount }) => ({
        key:            row.receipt_id ?? `${modeCode}-${row.transaction_id}`,
        modeId:         null,
        modeCode:       row.mode_code,
        modeName:       `${label} (${row.document_no})`,
        amount:         String(rowAmount),
        isHelper:       true,
        helperCategory: modeCode,
        creditRef:      row,
      }));
      return [...prev, ...entries];
    });
  };

  const handleAmountChange = (key, value) => {
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, amount: value } : p)));
  };

  const handleBankChange = (key, bankPosId) => {
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, bankPosId } : p)));
  };

  const handleRefNoChange = (key, refNo) => {
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, refNo } : p)));
  };
  if (total !== lastPricedTotal) {
    setLastPricedTotal(total);
    setPayments((prev) => {
      const nonHelpers = prev.filter((p) => !p.isHelper && !p.isCredit);
      if (nonHelpers.length !== 1) return prev;
      const helperPaid = prev.filter((p) => p.isHelper || p.isCredit)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const remaining = Math.max(0, total - helperPaid);
      return prev.map((p) => (!p.isHelper && !p.isCredit ? { ...p, amount: String(remaining) } : p));
    });
  }
  const emittedPayments = payments.map((p) => {
    const mode = paymentModes.find((m) => m.modeId === p.modeId);
    const bankAccount = p.bankPosId != null
      ? bankPosAccounts.find((a) => a.id === p.bankPosId)
      : null;
    return {
      key:          p.key,
      modeId:       p.modeId   ?? null,
      modeCode:     p.modeCode ?? '',
      modeName:     p.modeName,
      modeType:     p.modeType ?? mode?.modeType ?? null,
      amount:       Number(p.amount) || 0,
      ledgerId:     bankAccount?.ledgerId ?? mode?.ledgerId ?? null,
      raw:          mode?.raw ?? null,
      bankPosId:    bankAccount?.id ?? null,
      refNo:        p.refNo ?? '',
      creditRef:    p.creditRef ?? null,
      nectorPromotion: p.nectorPromotion ?? null,
    };
  });

  useEffect(() => {
    onChange?.(emittedPayments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, paymentModes, bankPosAccounts]);

  const balancesApplied = payments.filter((p) => p.isHelper)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const collectedByMode = payments.filter((p) => !p.isHelper);
  const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = Math.round((total - paidTotal) * 100) / 100;
  const isBalanced = payments.length > 0 && remaining === 0;

  const helperItems = [
    { label: 'Scheme Balance',  code: 'Scheme',      data: helpers.scheme,     loading: helpers.scheme?.isLoading },
    { label: 'Exchange Credit', code: 'Exchange',    data: helpers.exchange,   loading: helpers.exchange?.isLoading },
    { label: 'Credit Note',     code: 'CreditNote',  data: helpers.creditNote, loading: helpers.creditNote?.isLoading },
    { label: 'Old Gold Value',  code: 'OldGold',     data: helpers.oldGold,    loading: helpers.oldGold?.isLoading },
    { label: 'Advance Paid',    code: 'Advances',    data: helpers.advances,   loading: helpers.advances?.isLoading },
    { label: 'Other Credit',    code: 'Other',       data: helpers.other,      loading: helpers.other?.isLoading },
  ]; // each `data.rows` is the underlying POSReceiptsSelect rows for that bucket — see useInvoiceHelpers.js

  const hasVisibleHelpers = customerId && helperItems.some((h) => h.data?.amount > 0);

  const Wrapper = bare ? 'div' : 'section';

  return (
    <Wrapper className={bare ? 'flex flex-col gap-3' : 'flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm'}>
      {customerId && (
        <div className="flex flex-col gap-2">
          {helpers.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <Loader2 size={12} className="animate-spin" />
              Checking available balances…
            </div>
          )}
          {!helpers.isLoading && hasVisibleHelpers && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available Balances</p>
          )}
          {helperItems.map((h) => (
            <HelperBalanceRow
              key={h.code}
              label={h.label}
              amount={h.data?.amount}
              modeCode={h.code}
              rows={h.data?.rows}
              isApplied={appliedHelperCategories.includes(h.code)}
              onToggle={handleHelperToggle}
              isLoading={h.loading}
            />
          ))}
          {balancesApplied > 0 && (
            <p className="text-xs text-primary font-medium">
              {APP_CONFIG.CURRENCY.INR_SYMBOL}{balancesApplied.toLocaleString('en-IN', { maximumFractionDigits: 2 })} applied to this order
            </p>
          )}
        </div>
      )}

      {hasVisibleHelpers && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>or pay with</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}
      {isCashBlocked ? (
        <p className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          This customer has already taken{' '}
          {APP_CONFIG.CURRENCY.INR_SYMBOL}
          {dailyCashTaken.toLocaleString('en-IN', { maximumFractionDigits: 2 })} in cash today,
          so no further cash can be accepted (limit{' '}
          {APP_CONFIG.CURRENCY.INR_SYMBOL}
          {APP_CONFIG.COMPLIANCE.CASH_DAILY_LIMIT.toLocaleString('en-IN')}).
          OrnaVerse will refuse this sale until the cash total resets tomorrow —
          including when it is paid entirely by another method.
        </p>
      ) : dailyCashTaken > 0 && (
        <p className="text-xs text-muted-foreground">
          Cash available for this customer today:{' '}
          {APP_CONFIG.CURRENCY.INR_SYMBOL}
          {cashHeadroom.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </p>
      )}

      <PaymentModeSelector
        paymentModes={paymentModes}
        selectedModeIds={selectedModeIds}
        onToggle={handleModeToggle}
        isLoading={modesLoading}
        isError={modesError}
        disabledModeIds={loyaltyMode && loyaltyDisabledReason ? [loyaltyMode.modeId] : []}
        disabledReasons={loyaltyMode ? { [loyaltyMode.modeId]: loyaltyDisabledReason } : {}}
      />

      {payments.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border">
          {payments.map((p) => (
            <div key={p.key} className="flex flex-col gap-1.5">
              <PaymentAmountInput
                modeName={p.isCredit ? `${p.modeName} (Credit Applied)` : p.modeName}
                amount={p.amount}
                onChange={(value) => handleAmountChange(p.key, value)}
                readOnly={p.isCredit}
              />
              {requiresBank(p) && (
                <>
                  <BankPosSelect
                    value={p.bankPosId}
                    onChange={(bankPosId) => handleBankChange(p.key, bankPosId)}
                  />
                  <Input
                    value={p.refNo ?? ''}
                    onChange={(e) => handleRefNoChange(p.key, e.target.value)}
                    placeholder="Reference number"
                    className="h-10"
                    aria-label={`Reference for ${p.modeName}`}
                  />
                </>
              )}
            </div>
          ))}

          <div className="flex flex-col gap-1 text-sm pt-2 border-t border-border">
            {balancesApplied > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Balances applied</span>
                <span>−{APP_CONFIG.CURRENCY.INR_SYMBOL}{balancesApplied.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {collectedByMode.map((p) => (
              <div key={p.key} className="flex items-center justify-between text-muted-foreground">
                <span>{p.isCredit ? `Credit Applied (${p.modeName})` : `Collected (${p.modeName})`}</span>
                <span>{APP_CONFIG.CURRENCY.INR_SYMBOL}{(Number(p.amount) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            ))}
            {isBalanced ? (
              <p className="flex items-center gap-1.5 text-status-in-stock font-medium">
                <CheckCircle2 size={14} aria-hidden="true" />
                Paid in full
              </p>
            ) : (
              <div className="flex items-center justify-between font-medium">
                <span className="text-muted-foreground">
                  {remaining < 0
                    ? 'Over total'
                    : allowPartial ? 'Balance on collection' : 'Remaining'}
                </span>
                <span
                  className={
                    remaining < 0
                      ? 'text-status-made-order'
                      : allowPartial ? 'text-foreground/80' : 'text-destructive'
                  }
                >
                  {APP_CONFIG.CURRENCY.INR_SYMBOL}{Math.abs(remaining).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Wrapper>
  );
}
