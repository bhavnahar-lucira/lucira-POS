'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';

import { useSchemes }        from '@/hooks/schemes/useSchemes';
import { useEnrollCustomer } from '@/hooks/schemes/useEnrollCustomer';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { buildSchemeMonthlyDetails } from '@/services/schemeService';
import { selectActiveStoreId }   from '@/store/slices/storeSlice';
import {
  selectCartCustomerId,
  selectCartCustomerName,
  selectCartCustomerMobile,
} from '@/store/slices/cartSlice';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString } from '@/lib/dateUtils';

import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import SalesPersonSelect from '@/components/features/checkout/SalesPersonSelect';
import PageLoader from '@/components/shared/PageLoader';
import CustomerAttachedBanner from '@/components/shared/CustomerAttachedBanner';

// ── Schema ────────────────────────────────────────────────────
const enrollSchema = z.object({
  scheme_id:        z.coerce.number().min(1, 'Select a scheme'),
  scheme_amount:    z.coerce.number().min(1, 'Enter monthly amount'),
  tenure:           z.coerce.number().min(1, 'Enter tenure in months'),
  document_date:    z.string().min(1, 'Required'),
  sales_person_id:  z.coerce.number().min(1, 'Select a sales person'),
  nominee:          z.string().optional(),
  nominee_age:      z.coerce.number().optional(),
});

// ── Inner screen ──────────────────────────────────────────────
function EnrollScreen() {
  const router         = useRouter();
  const storeId        = useSelector(selectActiveStoreId);
  const customerId     = useSelector(selectCartCustomerId);
  const customerName   = useSelector(selectCartCustomerName);
  const customerMobile = useSelector(selectCartCustomerMobile);

  const { schemes, isLoading: schemesLoading } = useSchemes();
  const enroll = useEnrollCustomer();
  const headerConfig = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.SCHEME_ENROLLMENT);

  const today = todayDateString();

  const {
    register, handleSubmit, control, watch, setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(enrollSchema),
    defaultValues: {
      scheme_id:        '',
      scheme_amount:    '',
      tenure:           '',
      document_date:    today,
      sales_person_id:  '',
      nominee:          '',
      nominee_age:      '',
    },
  });

  const watchedSchemeId    = watch('scheme_id');
  const watchedAmount      = watch('scheme_amount');
  const watchedTenure      = watch('tenure');
  const watchedDocumentDate = watch('document_date');
  const selectedScheme  = schemes.find((s) => s.scheme_id === Number(watchedSchemeId));
  const isBelowMinimumAmount = !!selectedScheme
    && selectedScheme.scheme_amount != null
    && Number(watchedAmount) > 0
    && Number(watchedAmount) < selectedScheme.scheme_amount;
  useEffect(() => {
    if (!selectedScheme) return;
    if (selectedScheme.scheme_amount != null) setValue('scheme_amount', selectedScheme.scheme_amount);
    if (selectedScheme.tenure != null)        setValue('tenure', selectedScheme.tenure);
  }, [selectedScheme, setValue]);
  const monthlyPreview = useMemo(() => {
    const amount = Number(watchedAmount);
    const tenure = Number(watchedTenure);
    if (!watchedDocumentDate || !amount || !tenure || tenure < 1) return [];
    return buildSchemeMonthlyDetails(watchedDocumentDate, amount, tenure);
  }, [watchedDocumentDate, watchedAmount, watchedTenure]);

  const onSubmit = async (data) => {
    if (!customerId || !selectedScheme) return;
    if (isBelowMinimumAmount) return;
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

    const schemeAmount = Number(data.scheme_amount);
    const tenure        = Number(data.tenure);

    await enroll.mutateAsync({
      party_id:      customerId,
      party_name:    customerName   ?? undefined,
      mobile:        customerMobile ?? undefined,
      company_id:    storeId,
      scheme_id:     Number(data.scheme_id),
      scheme_amount: schemeAmount,
      tenure:        tenure,
      total_amount:  schemeAmount * tenure,
      document_date: data.document_date,
      scheme_status: 1,
      scheme_monthly_details: buildSchemeMonthlyDetails(data.document_date, schemeAmount, tenure),
      document_id:       APP_CONFIG.DOCUMENT_TYPES.SCHEME_ENROLLMENT,
      financial_year_id: headerConfig.financialYearId ?? undefined,
      currency_id:       APP_CONFIG.CURRENCY.INR_ID,
      exchange_rate:     1,
      user_id: null,
      is_document_number_editable: false,
      sales_person_id: Number(data.sales_person_id),
      scheme_type:   selectedScheme.scheme_type,
      frequency:     selectedScheme.frequency,
      bonus_type:    selectedScheme.bonus_type,
      bonus_value:   selectedScheme.bonus_value,
      use_rules:     selectedScheme.use_rules,
      scheme_bonus_value:     schemeAmount * (selectedScheme.bonus_value ?? 0),
      scheme_code:            selectedScheme.scheme_code,
      max_installment_amount: selectedScheme.max_installment_amount,
      ...(data.nominee    ? { nominee:     data.nominee }               : {}),
      ...(data.nominee_age ? { nominee_age: Number(data.nominee_age) } : {}),
    });

    router.push('/schemes');
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-8 max-w-2xl mx-auto">

      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground/80 w-fit -ml-1"
      >
        <ChevronLeft size={16} /> Back to Schemes
      </button>

      <h1 className="text-xl font-semibold text-foreground">Enroll in Scheme</h1>

      <CustomerAttachedBanner
        customerId={customerId}
        customerName={customerName}
        attachedLabel="Enrolling:"
        emptyMessage="Assign a customer from the header before enrolling."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

        <div className="flex flex-col gap-1.5">
          <Label>Scheme <span className="text-destructive">*</span></Label>
          <Controller
            name="scheme_id"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value ? String(field.value) : ''}
                onValueChange={(v) => field.onChange(Number(v))}
                disabled={schemesLoading}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder={schemesLoading ? 'Loading…' : 'Select scheme'} />
                </SelectTrigger>
                <SelectContent className="max-h-56 overflow-y-auto">
                  {schemes.map((s) => (
                    <SelectItem key={s.scheme_id} value={String(s.scheme_id)}>
                      {s.scheme_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.scheme_id && <p className="text-xs text-destructive">{errors.scheme_id.message}</p>}

          {selectedScheme && (
            <div className="rounded-lg border border-border bg-muted p-3 text-xs text-foreground/80 flex flex-col gap-1 mt-1">
              {selectedScheme.scheme_description && (
                <p>{selectedScheme.scheme_description}</p>
              )}
              {selectedScheme.scheme_code && (
                <p className="text-muted-foreground">Code: {selectedScheme.scheme_code}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll_amount">
            Monthly Amount (₹) <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
            <Input
              id="enroll_amount"
              type="number"
              inputMode="decimal"
              min={1}
              placeholder="0.00"
              {...register('scheme_amount')}
              className="h-11 pl-7"
            />
          </div>
          {errors.scheme_amount && <p className="text-xs text-destructive">{errors.scheme_amount.message}</p>}
          {isBelowMinimumAmount && (
            <p className="text-xs text-destructive">
              Scheme amount cannot be less than the original scheme amount.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll_tenure">
            Tenure (months) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="enroll_tenure"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="e.g. 12"
            {...register('tenure')}
            className="h-11"
          />
          {errors.tenure && <p className="text-xs text-destructive">{errors.tenure.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enroll_date">Start Date <span className="text-destructive">*</span></Label>
          <Input id="enroll_date" type="date" {...register('document_date')} className="h-11" max={today} />
          {errors.document_date && <p className="text-xs text-destructive">{errors.document_date.message}</p>}
        </div>

        {monthlyPreview.length > 0 && (
          <div className="rounded-xl border border-border bg-muted p-4 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Payment Plan ({monthlyPreview.length} installments)
            </p>
            <div className="flex flex-col divide-y divide-border">
              {monthlyPreview.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-foreground/80">
                    Month {idx + 1} · {new Date(row.due_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </span>
                  <span className="font-medium text-foreground">
                    {APP_CONFIG.CURRENCY.INR_SYMBOL}{row.month_amount.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border text-sm font-semibold text-foreground">
              <span>Total</span>
              <span>
                {APP_CONFIG.CURRENCY.INR_SYMBOL}
                {monthlyPreview.reduce((sum, r) => sum + r.month_amount, 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Sales Person <span className="text-destructive">*</span></Label>
          <Controller
            name="sales_person_id"
            control={control}
            render={({ field }) => (
              <SalesPersonSelect
                companyId={storeId}
                value={field.value ? Number(field.value) : null}
                onChange={field.onChange}
              />
            )}
          />
          {errors.sales_person_id && <p className="text-xs text-destructive">{errors.sales_person_id.message}</p>}
        </div>

        <div className="rounded-xl border border-border bg-muted p-4 flex flex-col gap-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nominee (Optional)</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enroll_nominee">Nominee Name</Label>
            <Input id="enroll_nominee" {...register('nominee')} className="h-11" placeholder="Full name" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enroll_nominee_age">Nominee Age</Label>
            <Input
              id="enroll_nominee_age"
              type="number"
              inputMode="numeric"
              min={0}
              {...register('nominee_age')}
              className="h-11"
              placeholder="Age in years"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={enroll.isPending || !customerId || isBelowMinimumAmount}
          className="h-12 mt-1"
        >
          {enroll.isPending ? 'Enrolling…' : 'Confirm Enrollment'}
        </Button>

      </form>
    </div>
  );
}

export default function SchemeEnrollPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <EnrollScreen />
    </Suspense>
  );
}