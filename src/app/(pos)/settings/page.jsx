'use client';

import { Suspense, useState } from 'react';
import { useSelector } from 'react-redux';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Coins, CreditCard, Landmark, Percent, Tag } from 'lucide-react';
import { useAddMetalRate } from '@/hooks/settings/useAddMetalRate';
import { usePaymentModes } from '@/hooks/checkout/usePaymentModes';
import { useBankPosAccounts } from '@/hooks/checkout/useBankPosAccounts';
import { useTaxes } from '@/hooks/settings/useTaxes';
import { useReasonCodes } from '@/hooks/settings/useReasonCodes';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import APP_CONFIG from '@/constants/appConfig';
import PageLoader from '@/components/shared/PageLoader';
import ErrorState from '@/components/shared/ErrorState';
import EmptyState from '@/components/shared/EmptyState';
import InlineLoader from '@/components/shared/InlineLoader';
import PillTabs from '@/components/shared/PillTabs';
import { Input } from '@/components/ui/input';
import { todayDateString } from '@/lib/dateUtils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const metalRateSchema = z.object({
  metal_type_id: z.coerce
    .number({ required_error: 'Select a metal type.' })
    .int()
    .positive('Select a metal type.'),
  purchase_rate: z.coerce
    .number({ required_error: 'Purchase rate is required.' })
    .positive('Purchase rate must be greater than 0.'),
  sales_rate: z.coerce
    .number({ required_error: 'Sales rate is required.' })
    .positive('Sales rate must be greater than 0.'),
  from_date: z
    .string({ required_error: 'Effective date is required.' })
    .min(1, 'Effective date is required.'),
});

// Metal type options — sourced from APP_CONFIG, never hardcode IDs
const METAL_OPTIONS = [
  { label: 'Gold',      value: APP_CONFIG.METAL_TYPES.GOLD },
  { label: 'Silver',    value: APP_CONFIG.METAL_TYPES.SILVER },
  { label: 'Platinum',  value: APP_CONFIG.METAL_TYPES.PLATINUM },
  { label: 'Palladium', value: APP_CONFIG.METAL_TYPES.PALLADIUM },
  { label: 'Alloy',     value: APP_CONFIG.METAL_TYPES.ALLOY },
];

function SettingsRow({ title, subtitle, trailing }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {trailing && <div className="shrink-0 text-sm text-foreground/80 tabular-nums">{trailing}</div>}
    </div>
  );
}

function SettingsCard({ children }) {
  return <div className="rounded-xl border border-border bg-card overflow-hidden">{children}</div>;
}

function MetalRateForm() {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(metalRateSchema),
    defaultValues: {
      metal_type_id: '',
      purchase_rate: '',
      sales_rate:    '',
      from_date:     todayDateString(),
    },
  });

  const mutation = useAddMetalRate({
    onSuccess: () => reset({
      metal_type_id: '',
      purchase_rate: '',
      sales_rate:    '',
      from_date:     todayDateString(),
    }),
  });

  const onSubmit = (data) => {
    mutation.mutate({
      metal_type_id: data.metal_type_id,
      purchase_rate: data.purchase_rate,
      sales_rate:    data.sales_rate,
      from_date:     data.from_date,
      currency_id:   APP_CONFIG.CURRENCY.INR_ID,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          Metal Type <span className="text-destructive">*</span>
        </label>
        <Controller
          name="metal_type_id"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value ? String(field.value) : ''}
              onValueChange={(value) => field.onChange(Number(value))}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select metal type" />
              </SelectTrigger>
              <SelectContent>
                {METAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.metal_type_id && (
          <p className="text-xs text-destructive">{errors.metal_type_id.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          Purchase Rate (₹) <span className="text-destructive">*</span>
        </label>
        <Input
          {...register('purchase_rate')}
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          className="h-11"
        />
        {errors.purchase_rate && (
          <p className="text-xs text-destructive">{errors.purchase_rate.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          Sales Rate (₹) <span className="text-destructive">*</span>
        </label>
        <Input
          {...register('sales_rate')}
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          className="h-11"
        />
        {errors.sales_rate && (
          <p className="text-xs text-destructive">{errors.sales_rate.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          Effective Date <span className="text-destructive">*</span>
        </label>
        <Input
          {...register('from_date')}
          type="date"
          max={todayDateString()}
          className="h-11"
        />
        {errors.from_date && (
          <p className="text-xs text-destructive">{errors.from_date.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={mutation.isPending}
        className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
      >
        {mutation.isPending ? 'Saving…' : 'Save Metal Rate'}
      </button>

    </form>
  );
}

function PaymentModesTab() {
  const { paymentModes, isLoading, isError, refetch } = usePaymentModes();

  if (isLoading) return <InlineLoader className="py-12" label="Loading payment modes…" />;
  if (isError)   return <ErrorState title="Failed to load payment modes." onRetry={refetch} />;
  if (!paymentModes.length) return <EmptyState icon={CreditCard} title="No payment modes configured." className="border-0 py-12" />;

  return (
    <SettingsCard>
      {paymentModes.map((m) => (
        <SettingsRow
          key={m.modeId}
          title={m.modeName}
          subtitle={m.modeCode !== m.modeName ? m.modeCode : undefined}
          trailing={m.onlyForPos ? 'POS' : undefined}
        />
      ))}
    </SettingsCard>
  );
}

function BankAccountsTab() {
  const { bankPosAccounts, isLoading, isError, refetch } = useBankPosAccounts();

  if (isLoading) return <InlineLoader className="py-12" label="Loading bank accounts…" />;
  if (isError)   return <ErrorState title="Failed to load bank accounts." onRetry={refetch} />;
  if (!bankPosAccounts.length) return <EmptyState icon={Landmark} title="No bank accounts configured." className="border-0 py-12" />;

  return (
    <SettingsCard>
      {bankPosAccounts.map((a) => (
        <SettingsRow key={a.id} title={a.name} subtitle={a.code !== a.name ? a.code : undefined} />
      ))}
    </SettingsCard>
  );
}

function TaxesTab() {
  const storeId = useSelector(selectActiveStoreId);
  const { taxes, notConfigured, isLoading, isError, refetch } = useTaxes(storeId);

  if (isLoading) return <InlineLoader className="py-12" label="Loading tax rates…" />;
  if (notConfigured) {
    return (
      <EmptyState
        icon={Percent}
        title="No tax template configured for this store."
        description="This is set on OrnaVerse's side, not in the POS."
        className="border-0 py-12"
      />
    );
  }
  if (isError) return <ErrorState title="Failed to load tax rates." onRetry={refetch} />;
  if (!taxes.length) return <EmptyState icon={Percent} title="No tax rates found." className="border-0 py-12" />;

  return (
    <SettingsCard>
      {taxes.map((t, i) => (
        <SettingsRow
          key={t.tax_id ?? i}
          title={t.tax_name ?? t.name ?? `Tax ${i + 1}`}
          trailing={t.tax_percent != null ? `${t.tax_percent}%` : undefined}
        />
      ))}
    </SettingsCard>
  );
}

function ReasonCodesTab() {
  const { reasonCodes, isLoading, isError, refetch } = useReasonCodes();

  if (isLoading) return <InlineLoader className="py-12" label="Loading reason codes…" />;
  if (isError) {
    return (
      <ErrorState
        title="Reason codes aren't available right now."
        description="Confirmed a server-side issue on OrnaVerse's end (Reason/List fails regardless of what's sent), not something wrong with this screen."
        onRetry={refetch}
      />
    );
  }
  if (!reasonCodes.length) return <EmptyState icon={Tag} title="No reason codes found." className="border-0 py-12" />;

  return (
    <SettingsCard>
      {reasonCodes.map((r, i) => (
        <SettingsRow key={r.reason_id ?? i} title={r.reason_name ?? r.name ?? `Reason ${i + 1}`} />
      ))}
    </SettingsCard>
  );
}

const TABS = [
  { key: 'metal-rates', label: 'Metal Rates', icon: Coins },
  { key: 'payment-modes', label: 'Payment Modes', icon: CreditCard },
  { key: 'bank-accounts', label: 'Bank Accounts', icon: Landmark },
  { key: 'taxes', label: 'Taxes', icon: Percent },
  { key: 'reason-codes', label: 'Reason Codes', icon: Tag },
];

function SettingsScreen() {
  const [activeTab, setActiveTab] = useState(TABS[0].key);

  return (
    <div className="p-4 pb-8 max-w-lg flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Store configuration</p>

      <PillTabs tabs={TABS} value={activeTab} onChange={setActiveTab} variant="chip" scrollable />

      {activeTab === 'metal-rates' && (
        <SettingsCard>
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h2 className="text-sm font-semibold text-foreground">Metal Rates</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set purchase and sales rates per metal type
            </p>
          </div>
          <div className="p-4">
            <MetalRateForm />
          </div>
        </SettingsCard>
      )}

      {activeTab === 'payment-modes' && <PaymentModesTab />}
      {activeTab === 'bank-accounts' && <BankAccountsTab />}
      {activeTab === 'taxes'         && <TaxesTab />}
      {activeTab === 'reason-codes'  && <ReasonCodesTab />}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SettingsScreen />
    </Suspense>
  );
}
