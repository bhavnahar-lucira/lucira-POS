'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { RefreshCw, LayoutGrid, Plus, X } from 'lucide-react';

import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';
import { useSchemes }            from '@/hooks/schemes/useSchemes';
import { useSchemeEnrollments }  from '@/hooks/schemes/useSchemeEnrollments';
import { useSchemeReceipt }      from '@/hooks/schemes/useSchemeReceipt';
import { usePaymentModes }       from '@/hooks/checkout/usePaymentModes';
import { useOrderHeaderConfig }  from '@/hooks/checkout/useOrderHeaderConfig';
import { useSchemeMonthlyDetails } from '@/hooks/schemes/useSchemeMonthlyDetails';
import { buildSchemeReceiptPayload } from '@/services/schemeService';
import { paymentRequiresBank } from '@/lib/checkout/paymentModeRules';
import { selectActiveStoreId }   from '@/store/slices/storeSlice';
import { selectCartCustomerId, selectCartCustomerName } from '@/store/slices/cartSlice';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString } from '@/lib/dateUtils';

import SchemeCard  from '@/components/features/schemes/SchemeCard';
import EnrollmentDetailSheet from '@/components/features/schemes/EnrollmentDetailSheet';
import PageLoader  from '@/components/shared/PageLoader';
import BottomSheet from '@/components/shared/BottomSheet';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import PaymentModeSelect from '@/components/shared/PaymentModeSelect';
import PillTabs    from '@/components/shared/PillTabs';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { formatCurrency, formatDate, MONTH_NAMES } from '@/lib/schemeFormat';

const STATUS_STYLES = {
  active:    'bg-status-in-stock/10 text-status-in-stock',
  completed: 'bg-blue-50    text-blue-700',
  inactive:  'bg-muted  text-muted-foreground',
  matured:   'bg-blue-50    text-blue-700',
  redeemed:  'bg-blue-50    text-blue-700',
  cancelled: 'bg-status-error/10 text-status-error',
  default:   'bg-muted  text-muted-foreground',
};

const receiptSchema = z.object({
  amount:        z.coerce.number().min(1, 'Enter amount'),
  mode_id:       z.coerce.number().min(1, 'Select payment mode'),
  mode_name:     z.string().optional(),
  document_date: z.string().min(1, 'Required'),
  month_ids:     z.array(z.number()).min(1, 'Select at least one month'),
  bank_pos_id:   z.coerce.number().optional().or(z.literal('')),
  ref_no:        z.string().optional(),
});

function ReceiptSheet({ enrollment, isOpen, onClose }) {
  const storeId = useSelector(selectActiveStoreId);
  const { paymentModes, isLoading: modesLoading } = usePaymentModes();
  const createReceipt = useSchemeReceipt();
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.SCHEME_RECEIPT);
  const { data: months = [] } = useSchemeMonthlyDetails(enrollment?.enrollmentId);
  const unpaidMonths = months.filter((m) => !m.isPaid);

  const today = todayDateString();

  const {
    register, handleSubmit, control, setValue, reset, watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      amount:        enrollment?.schemeAmount ?? '',
      mode_id:       '',
      mode_name:     '',
      document_date: today,
      month_ids:     [],
      bank_pos_id:   '',
      ref_no:        '',
    },
  });

  const selectedMonths = watch('month_ids');
  useEffect(() => {
    if (isOpen && enrollment) {
      reset({
        amount:        enrollment.schemeAmount ?? '',
        mode_id:       '',
        mode_name:     '',
        document_date: todayDateString(),
        month_ids:     [],
        bank_pos_id:   '',
        ref_no:        '',
      });
    }
  }, [isOpen, enrollment, reset]);
  const [pendingReceiptData, setPendingReceiptData] = useState(null);
  const [isPaymentConfirmOpen, setIsPaymentConfirmOpen] = useState(false);

  const prepareSubmit = (data) => {
    const selectedMode = paymentModes.find((m) => m.modeId === Number(data.mode_id));
    if (selectedMode && paymentRequiresBank(selectedMode)) {
      if (!data.bank_pos_id) return toast.error('Select the bank account this payment settles to.');
      if (!data.ref_no?.trim()) return toast.error('Enter a reference number for this payment.');
    }
    if (!headerConfig.isReady) {
      if (headerConfig.isError) headerConfig.refetch();
      toast.error(
        headerConfig.isConfigMissing
          ? "This document type isn't set up for your store yet — contact OrnaVerse support."
          : headerConfig.isError
            ? 'Store configuration failed to load — retrying now, try again in a moment.'
            : 'Store configuration is still loading — try again in a moment.'
      );
      return;
    }
    setPendingReceiptData(data);
    setIsPaymentConfirmOpen(true);
  };

  const handlePaymentConfirmed = () => {
    if (pendingReceiptData) submitReceipt(pendingReceiptData);
    setPendingReceiptData(null);
  };
  
  const handlePaymentDeclined = () => {
    setPendingReceiptData(null);
    toast.info('Payment declined — nothing was saved.');
  };

  const submitReceipt = async (data) => {
    const amount = Number(data.amount);
    const selectedMode = paymentModes.find((m) => m.modeId === Number(data.mode_id));
    
    await createReceipt.mutateAsync(buildSchemeReceiptPayload({
      enrollmentId:     enrollment.enrollmentId,
      schemeType:       enrollment.schemeType,
      schemeUniqueCode: enrollment.schemeUniqueCode,
      partyId:          enrollment.partyId,
      partyName:        enrollment.partyName,
      mobile:           enrollment.mobile,
      email:            enrollment.email,
      activeStoreId:    storeId,
      financialYearId:  headerConfig.financialYearId,
      ledgerId:         headerConfig.ledgerId,
      documentDate:     data.document_date,
      monthIds:         data.month_ids,
      amount,
      allowBackdatedEntry:      true,
      numberOfBackdatedDays:    headerConfig.numberOfBackdatedDays,
      isDocumentNumberEditable: headerConfig.isDocumentNumberEditable,
      details: [{
        modeId:     Number(data.mode_id),
        amount,
        ledgerId:   selectedMode?.ledgerId,
        ledgerName: selectedMode?.ledgerName,
        modeName:   selectedMode?.modeName,
        bankPos: data.bank_pos_id || undefined,
        refNo:   data.ref_no?.trim() || undefined,
      }],
    }));
    reset();
    onClose();
  };

  if (!enrollment) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Record Payment">
      <div className="flex flex-col gap-4">

        <div className="rounded-xl border border-border bg-muted p-3 text-sm flex flex-col gap-1">
          <p className="font-medium text-foreground">{enrollment.schemeName}</p>
          <p className="text-muted-foreground">
            Monthly: {formatCurrency(enrollment.schemeAmount)} ·{' '}
            Paid so far: {formatCurrency(enrollment.investedAmount)}
          </p>
        </div>

        <form onSubmit={handleSubmit(prepareSubmit)} className="flex flex-col gap-4">

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rcpt_amount">
              Amount (₹) <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <Input
                id="rcpt_amount"
                type="number"
                inputMode="decimal"
                {...register('amount')}
                className="h-11 pl-7"
              />
            </div>
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Paying For <span className="text-destructive">*</span></Label>
            {unpaidMonths.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Every instalment on this enrollment is already paid.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unpaidMonths.map((m) => {
                  const isSelected = selectedMonths.includes(m.monthId);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        setValue(
                          'month_ids',
                          isSelected
                            ? selectedMonths.filter((x) => x !== m.monthId)
                            : [...selectedMonths, m.monthId],
                          { shouldValidate: true },
                        )
                      }
                      className={`min-h-11 rounded-xl border px-3 py-2 text-sm transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      {MONTH_NAMES[m.monthId] ?? `Month ${m.monthId}`}
                      {m.isOverdue && (
                        <span className="ml-1.5 text-xs text-destructive">overdue</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {errors.month_ids && <p className="text-xs text-destructive">{errors.month_ids.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Payment Mode <span className="text-destructive">*</span></Label>
            <PaymentModeSelect
              control={control}
              name="mode_id"
              paymentModes={paymentModes}
              modesLoading={modesLoading}
              placeholder="Select mode"
              onSelect={(mode) => setValue('mode_name', mode.modeName)}
              bankFieldName="bank_pos_id"
              refFieldName="ref_no"
            />
            {errors.mode_id && <p className="text-xs text-destructive">{errors.mode_id.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rcpt_date">Payment Date <span className="text-destructive">*</span></Label>
            <Input id="rcpt_date" type="date" max={today} {...register('document_date')} className="h-11" />
            {errors.document_date && <p className="text-xs text-destructive">{errors.document_date.message}</p>}
          </div>

          <Button type="submit" disabled={createReceipt.isPending} className="h-11">
            {createReceipt.isPending ? 'Recording…' : 'Record Payment'}
          </Button>
        </form>
      </div>

      {/* Payment-confirmation gate — see prepareSubmit above. */}
      <ConfirmDialog
        isOpen={isPaymentConfirmOpen}
        onOpenChange={setIsPaymentConfirmOpen}
        title="Confirm payment on terminal"
        description={`Has the payment of ${formatCurrency(pendingReceiptData?.amount)} been completed on the payment terminal? Confirming will record this instalment — declining will not save anything.`}
        confirmLabel="Yes, Payment Received"
        cancelLabel="No, Declined"
        confirmVariant="default"
        onConfirm={handlePaymentConfirmed}
        onCancel={handlePaymentDeclined}
      />
    </BottomSheet>
  );
}

function SchemesTab() {
  const { schemes, isLoading, isError, refetch } = useSchemes();

  if (isLoading) return <PageLoader />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-6">
        <p className="text-sm text-muted-foreground text-center">Failed to load schemes. Please try again.</p>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-sm font-medium text-primary">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  if (schemes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 p-6">
        <LayoutGrid className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground text-center">No schemes available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button asChild className="w-full gap-2">
        <Link href="/schemes/enroll">
          <Plus size={16} /> Enroll Customer
        </Link>
      </Button>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {schemes.map((scheme) => (
          <SchemeCard key={scheme.scheme_id} scheme={scheme} />
        ))}
      </div>
    </div>
  );
}

function EnrollmentsTab() {
  const customerId   = useSelector(selectCartCustomerId);
  const customerName = useSelector(selectCartCustomerName);

  const { data: enrollments = [], isLoading, isError, refetch } =
    useSchemeEnrollments(customerId ? { partyId: customerId } : {});

  const [receiptTarget, setReceiptTarget] = useState(null);
  const [detailTarget,  setDetailTarget]  = useState(null);

  if (isLoading) {
    return <InlineLoader className="py-16" label="Loading enrollments…" />;
  }

  if (isError) {
    return <ErrorState className="py-16" title="Failed to load enrollments." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {customerId && (
        <div className="rounded-xl border border-status-in-stock/30 bg-status-in-stock/10 px-3 py-2 text-sm text-status-in-stock">
          Showing enrollments for <strong>{customerName}</strong>
        </div>
      )}

      {enrollments.length === 0 ? (
        <EmptyState
          className="border-0 py-16"
          icon={LayoutGrid}
          title={customerId ? 'No enrollments for this customer.' : 'No enrollments found.'}
          action={(
            <Button asChild variant="outline" size="sm">
              <Link href="/schemes/enroll"><Plus size={14} className="mr-1" /> Enroll Now</Link>
            </Button>
          )}
        />
      ) : (
        enrollments.map((enrollment) => (
          <div key={enrollment.enrollmentId} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{enrollment.schemeName}</p>
                <p className="text-xs text-muted-foreground">{enrollment.partyName} · {enrollment.mobile}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                STATUS_STYLES[enrollment.status] ?? STATUS_STYLES.default
              }`}>
                {enrollment.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Monthly</span>
              <span className="text-right font-medium text-foreground/80">
                {formatCurrency(enrollment.schemeAmount)}
              </span>

              <span className="text-muted-foreground">Tenure</span>
              <span className="text-right font-medium text-foreground/80">
                {enrollment.tenure} months
              </span>

              <span className="text-muted-foreground">Invested</span>
              <span className="text-right font-medium text-foreground/80">
                {formatCurrency(enrollment.investedAmount)}
              </span>

              {enrollment.benefitAmount > 0 && (
                <>
                  <span className="text-muted-foreground">Benefit</span>
                  <span className="text-right font-medium text-status-in-stock">
                    {formatCurrency(enrollment.benefitAmount)}
                  </span>
                </>
              )}

              <span className="text-muted-foreground">Enrolled</span>
              <span className="text-right text-muted-foreground text-xs">
                {formatDate(enrollment.documentDate)}
              </span>
            </div>

            <div className="flex gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailTarget(enrollment)}
              >
                View Details
              </Button>
              {enrollment.hasPendingInstallment && enrollment.status !== 'cancelled' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReceiptTarget(enrollment)}
                >
                  Record Payment
                </Button>
              )}
            </div>
          </div>
        ))
      )}

      <ReceiptSheet
        enrollment={receiptTarget}
        isOpen={!!receiptTarget}
        onClose={() => setReceiptTarget(null)}
      />

      <EnrollmentDetailSheet
        enrollment={detailTarget}
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
      />
    </div>
  );
}

function SchemesScreen() {
  const [activeTab, setActiveTab] = useState('schemes');

  const TABS = [
    { key: 'schemes',     label: 'Schemes' },
    { key: 'enrollments', label: 'Enrollments' },
  ];

  return (
    <div className="p-4 pb-8 max-w-2xl mx-auto">
      <div className="mb-4">
        <PillTabs tabs={TABS} value={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'schemes'     && <SchemesTab />}
      {activeTab === 'enrollments' && <EnrollmentsTab />}
    </div>
  );
}

export default function SchemesPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SchemesScreen />
    </Suspense>
  );
}