'use client';

// Per-enrollment detail: month-by-month payment schedule + payment
// (receipt) history, via useSchemeMonthlyDetails.js / useSchemeReceiptHistory.js.

import { useState } from 'react';
import { AlertCircle, CalendarClock, Receipt, Calculator } from 'lucide-react';
import BottomSheet from '@/components/shared/BottomSheet';
import PillTabs from '@/components/shared/PillTabs';
import PaymentStatusBadge, { mapScheduleStatus } from '@/components/shared/PaymentStatusBadge';
import { useSchemeMonthlyDetails } from '@/hooks/schemes/useSchemeMonthlyDetails';
import { useSchemeReceiptHistory } from '@/hooks/schemes/useSchemeReceiptHistory';
import { useSchemeBenefits } from '@/hooks/schemes/useSchemeBenefits';
import { useCloseSchemeEnrollment } from '@/hooks/schemes/useCloseSchemeEnrollment';
import { useRedeemSchemeEnrollment } from '@/hooks/schemes/useRedeemSchemeEnrollment';
import { formatCurrency, formatDate, formatMonthName } from '@/lib/schemeFormat';

const TABS = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'payments', label: 'Payments' },
  { key: 'closure',  label: 'Closure' },
];

const CLOSURE_ACTIONS = [
  {
    key: 'maturity',
    label: 'Maturity',
    hint: 'What the customer receives at the end of the full tenure.',
  },
  {
    key: 'foreclose',
    label: 'Foreclosure',
    hint: 'Early exit, with a reduced benefit.',
  },
  {
    key: 'cancellation',
    label: 'Cancellation',
    hint: 'Exit with no benefit — refund of what was paid in.',
  },
];

// Unknown keys still render (de-snake-cased) rather than being dropped, in
// case foreclosure/cancellation return extra fields (see report for the
// confirmed response shape).
const BENEFIT_FIELDS = {
  principal_paid: { label: 'Principal Paid', format: 'money' },
  total_benefit:  { label: 'Benefit Earned', format: 'money' },
  total_payout:   { label: 'Total Payout',   format: 'money', emphasis: true },
  ontime_rate:    { label: 'On-time Rate',   format: 'rate' },
  delayed_rate:   { label: 'Delayed Rate',   format: 'rate' },
  grace_days:     { label: 'Grace Period',   format: 'days' },
  // seen on the enrollment entity itself
  invested_amount: { label: 'Invested',      format: 'money' },
  benifit_amount:  { label: 'Benefit',       format: 'money' }, // API's spelling
  total_payable:   { label: 'Total Payable', format: 'money' },
};

// Order matters: principal, then what it earned, then the total.
const BENEFIT_ORDER = [
  'principal_paid', 'total_benefit', 'total_payout',
  'ontime_rate', 'delayed_rate', 'grace_days',
];

function formatBenefitValue(key, value) {
  switch (BENEFIT_FIELDS[key]?.format) {
    case 'money': return formatCurrency(value);
    case 'rate':  return `${(Number(value) * 100).toFixed(2)}%`;
    case 'days':  return `${value} days`;
    default:      return String(value);
  }
}

function prettyLabel(key) {
  return BENEFIT_FIELDS[key]?.label
    ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Sorts known fields into a sensible order, unknown ones last. */
function orderBenefitRows(entries) {
  return entries.sort(([a], [b]) => {
    const ia = BENEFIT_ORDER.indexOf(a), ib = BENEFIT_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function LoadingRow() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function ErrorRow({ label }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
      <AlertCircle size={20} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function EmptyRow({ icon: Icon, label }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
      <Icon size={24} className="opacity-40" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function ScheduleTab({ enrollmentId }) {
  const { data: months = [], isLoading, isError } = useSchemeMonthlyDetails(enrollmentId);

  if (isLoading) return <LoadingRow />;
  if (isError)   return <ErrorRow label="Failed to load payment schedule." />;
  if (!months.length) return <EmptyRow icon={CalendarClock} label="No schedule available yet." />;

  return (
    <div className="flex flex-col gap-2">
      {months.map((month) => {
        const rawStatus = month.isPaid ? 'paid' : month.isOverdue ? 'overdue' : 'upcoming';
        return (
          <div
            key={month.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            <div className="min-w-0">
              {/* month_id is the calendar month (1-12), not a sequential
                  instalment count — always display via formatMonthName. */}
              <p className="text-sm font-medium text-foreground">{formatMonthName(month.monthId)}</p>
              <p className="text-xs text-muted-foreground">
                Due {formatDate(month.dueDate)}
                {month.isPaid && month.paidOnDate && ` · Paid ${formatDate(month.paidOnDate)}`}
                {month.isPaid && month.delayDays > 0 && ` (${month.delayDays}d late)`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-sm font-semibold text-foreground">{formatCurrency(month.amount)}</span>
              <PaymentStatusBadge
                status={mapScheduleStatus(rawStatus)}
                labelOverride={month.isPaid ? 'Paid' : month.isOverdue ? 'Overdue' : 'Upcoming'}
                size="sm"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Compares by calendar day only, ignoring time-of-day — a receipt's
// document_date carries a real timestamp while a schedule row's
// paid_on_date is stamped at midnight, so the two never match to the
// millisecond, only to the day.
function isSameCalendarDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

// Which schedule month(s) this receipt actually paid for. SchemeReceipt/List
// carries no month reference (see report), so this is inferred by matching
// each receipt to schedule row(s) that share its paid-on calendar day. A
// receipt can cover more than one month, so this returns every match, or
// nothing when no schedule row shares that exact day.
function matchedMonthNames(receipt, months) {
  return months
    .filter((m) => m.isPaid && isSameCalendarDay(m.paidOnDate, receipt.documentDate))
    .map((m) => formatMonthName(m.monthId));
}

function PaymentsTab({ enrollmentId }) {
  const { data: receipts = [], isLoading: receiptsLoading, isError: receiptsError } = useSchemeReceiptHistory(enrollmentId);
  // Also fetched here (see matchedMonthNames) to resolve which month each receipt paid for.
  const { data: months = [], isLoading: monthsLoading } = useSchemeMonthlyDetails(enrollmentId);

  if (receiptsLoading || monthsLoading) return <LoadingRow />;
  if (receiptsError)   return <ErrorRow label="Failed to load payment history." />;

  // A month can be marked paid with no matching SchemeReceipt — confirmed
  // live (2026-09-26): the first instalment is routinely collected as part
  // of the enrollment's own invoice rather than a separate scheme receipt,
  // so there's nothing in SchemeReceipt/List to show for it. Surface it
  // from the schedule row itself instead of hiding it.
  const unmatchedPaidMonths = months.filter(
    (m) => m.isPaid && !receipts.some((r) => isSameCalendarDay(m.paidOnDate, r.documentDate))
  );

  if (!receipts.length && !unmatchedPaidMonths.length) {
    return <EmptyRow icon={Receipt} label="No payments recorded yet." />;
  }

  return (
    <div className="flex flex-col gap-2">
      {receipts.map((receipt) => {
        const matchedMonths = matchedMonthNames(receipt, months);
        return (
          <div
            key={receipt.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{receipt.documentNo ?? `Receipt #${receipt.id}`}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(receipt.documentDate)}
                {receipt.modeName && ` · ${receipt.modeName}`}
              </p>
              {matchedMonths.length > 0 && (
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  For: {matchedMonths.join(', ')}
                </p>
              )}
            </div>
            <span className="text-sm font-semibold text-foreground shrink-0">
              {formatCurrency(receipt.amount)}
            </span>
          </div>
        );
      })}
      {unmatchedPaidMonths.map((month) => (
        <div
          key={`month-${month.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{formatMonthName(month.monthId)} instalment</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(month.paidOnDate)} · Paid at enrollment
            </p>
          </div>
          <span className="text-sm font-semibold text-foreground shrink-0">
            {formatCurrency(month.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Calculate a figure, then optionally record it on the enrollment.
// scheme_status is now written for the two CONFIRMED kinds (cancellation,
// maturity — see closeSchemeEnrollment's own CONFIRMED_STATUS_BY_KIND);
// foreclose still leaves it untouched since that value was never
// separately captured.
function ClosureTab({ enrollmentId, enrollmentStatus }) {
  const { calculate, kind, result, error, isLoading } = useSchemeBenefits(enrollmentId);
  const closeMutation = useCloseSchemeEnrollment();
  const redeemMutation = useRedeemSchemeEnrollment();

  const payload = result?.Entity ?? result;
  const rows = payload && typeof payload === 'object'
    ? orderBenefitRows(
        Object.entries(payload).filter(([, v]) => v != null && typeof v !== 'object'),
      )
    : [];
  const installments = Array.isArray(payload?.Installments) ? payload.Installments : [];
  const delayedCount = installments.filter((i) => i.is_delayed).length;
  const payoutAmount = payload?.total_payout ?? payload?.total_benefit ?? null;
  // CONFIRMED LIVE 2026-09-18, two separate real captures: cancellation
  // writes benifit_amount:0 (real refund was ₹1,000 — "no benefit, refund
  // only" is the literal field OrnaVerse writes, not just this app's
  // paraphrase); maturity writes benifit_amount:999.99, matching that
  // calculation's own total_benefit EXACTLY — not total_payout (9999.99,
  // principal+benefit combined), which is what payoutAmount above resolves
  // to first. So benifit_amount is always total_benefit specifically
  // (0 for cancellation, since GetSchemeCancellation's own total_benefit is
  // 0 by definition — no separate special-case needed); payoutAmount stays
  // the right figure to SHOW staff (what the customer actually gets back).
  const benefitAmountToRecord = payload?.total_benefit ?? 0;

  const handleRecord = () => {
    if (payoutAmount == null) return;
    closeMutation.mutate({ enrollmentId, benefitAmount: benefitAmountToRecord, kind });
  };

  const handleRedeem = () => {
    redeemMutation.mutate(enrollmentId);
  };

  return (
    <div className="flex flex-col gap-3">
      {enrollmentStatus === 'matured' && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium text-foreground">This enrollment is Matured.</p>
          <p className="text-xs text-muted-foreground">
            Redeem it to reach the final state — CONFIRMED LIVE 2026-09-18:
            this is a genuinely separate step from Mature, doesn&apos;t
            recalculate anything (the benefit already recorded at Mature
            time carries over unchanged), and only moves the enrollment to
            Redeemed.
          </p>
          <button
            type="button"
            onClick={handleRedeem}
            disabled={redeemMutation.isPending}
            className="flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {redeemMutation.isPending ? 'Redeeming…' : 'Redeem'}
          </button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Calculate a figure, then record it on the enrollment.
        {kind === 'cancellation'
          ? ' Recording a cancellation marks the enrollment cancelled.'
          : kind === 'maturity'
            ? ' Recording maturity marks the enrollment matured — redeem it separately afterward (see above once it is).'
            : ' This does not yet change the enrollment’s status — see below.'}
      </p>

      <div className="flex flex-col gap-2">
        {CLOSURE_ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => calculate(action.key)}
            disabled={isLoading}
            className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{action.label}</span>
              <span className="block text-xs text-muted-foreground">{action.hint}</span>
            </span>
            <Calculator size={16} className="shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>

      {isLoading && <LoadingRow />}

      {error && !isLoading && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {result && !isLoading && !error && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted p-3">
          <p className="text-sm font-medium text-foreground">
            {CLOSURE_ACTIONS.find((a) => a.key === kind)?.label} calculation
          </p>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No figures returned.</p>
          ) : (
            <dl className="flex flex-col gap-1">
              {rows.map(([key, value]) => {
                const emphasis = BENEFIT_FIELDS[key]?.emphasis;
                return (
                  <div
                    key={key}
                    className={`flex items-baseline justify-between gap-3 ${
                      emphasis ? 'mt-1 border-t border-border pt-2' : ''
                    }`}
                  >
                    <dt className={emphasis
                      ? 'text-sm font-medium text-foreground'
                      : 'text-xs text-muted-foreground'}>
                      {prettyLabel(key)}
                    </dt>
                    <dd className={`tabular-nums ${
                      emphasis
                        ? 'text-base font-semibold text-foreground'
                        : 'text-sm font-medium text-foreground'
                    }`}>
                      {formatBenefitValue(key, value)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}

          {installments.length > 0 && (
            <p className="border-t border-border pt-2 text-xs text-muted-foreground">
              Calculated across {installments.length} instalment
              {installments.length === 1 ? '' : 's'}
              {delayedCount > 0
                ? ` · ${delayedCount} paid late, charged at the delayed rate`
                : ' · all paid on time'}
            </p>
          )}

          {payoutAmount != null && (
            <div className="border-t border-border pt-2 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleRecord}
                disabled={closeMutation.isPending}
                className="flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {closeMutation.isPending ? 'Recording…' : `Record ${formatCurrency(payoutAmount)} on this enrollment`}
              </button>
              <p className="text-xs text-muted-foreground">
                {kind === 'cancellation' || kind === 'maturity'
                  ? `Also marks the enrollment ${kind === 'cancellation' ? 'Cancelled' : 'Matured'}.`
                  : 'Records the benefit amount only — foreclosure’s real status value hasn’t been confirmed yet, so this does not change the enrollment’s status.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EnrollmentDetailSheet({ enrollment, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('schedule');

  if (!enrollment) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Enrollment Details">
      <div className="flex flex-col gap-4">

        <div className="rounded-xl border border-border bg-muted p-3 text-sm flex flex-col gap-1">
          <p className="font-medium text-foreground">{enrollment.schemeName}</p>
          <p className="text-muted-foreground">{enrollment.partyName} · {enrollment.mobile}</p>
          <p className="text-muted-foreground">
            Monthly: {formatCurrency(enrollment.schemeAmount)} · Tenure: {enrollment.tenure} months
          </p>
        </div>

        <PillTabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

        {activeTab === 'schedule' && <ScheduleTab enrollmentId={enrollment.enrollmentId} />}
        {activeTab === 'payments' && <PaymentsTab enrollmentId={enrollment.enrollmentId} />}
        {activeTab === 'closure'  && (
          <ClosureTab enrollmentId={enrollment.enrollmentId} enrollmentStatus={enrollment.status} />
        )}
      </div>
    </BottomSheet>
  );
}
