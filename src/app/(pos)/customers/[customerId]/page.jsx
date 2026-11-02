'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Phone, Mail, MapPin, CreditCard,
  ClipboardList, BookOpen,
  ShoppingCart, FileText, RotateCcw, ArrowLeftRight, Coins, Gem, Receipt, Star, Info, Heart, History,
  ExternalLink, Orbit,
} from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import PhoneNumberField from '@/components/shared/PhoneNumberField';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { getLoyaltyCheckoutSettings } from '@/services/nectorService';
import { isThirdPartyLoyalty } from '@/lib/checkout/loyaltyEligibility';
import { useNectorCheckoutInfo } from '@/hooks/checkout/useNectorCheckoutInfo';
import { QUERY_KEYS } from '@/constants/queryKeys';

import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { GENDER_OPTIONS, MARITAL_STATUS_OPTIONS, RELIGION_OPTIONS } from '@/constants/customerOptions';
import LocationSelect from '@/components/shared/LocationSelect';
import PanDocumentUpload from '@/components/shared/PanDocumentUpload';
import PillTabs from '@/components/shared/PillTabs';
import TicketList from '@/components/features/ticketing/TicketList';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';

import { buildUpdateCustomerSchema } from '@/validators/customerSchema';
import { storedValueToPhone, isMaskedValue } from '@/lib/normalizers/customer';
import { useCustomerSession }     from '@/hooks/customer/useCustomerSession';
import { useRetrieveCustomer }    from '@/hooks/customer/useRetrieveCustomer';
import { useUpdateCustomer }      from '@/hooks/customer/useUpdateCustomer';
import { useCustomerEnrollments } from '@/hooks/customer/useCustomerEnrollments';
import { useCustomer360 }         from '@/hooks/customer/useCustomer360';
import { useCustomerWishlist }    from '@/hooks/customer/useCustomerWishlist';
import { useCustomerRecentlyViewed } from '@/hooks/customer/useCustomerRecentlyViewed';
import { useWebsiteActivity }     from '@/hooks/customer/useWebsiteActivity';
import { useAllCatalog }          from '@/hooks/catalog/useAllCatalog';
import { buildSkuIndex, matchBySku } from '@/lib/catalog/matchCatalogBySku';
import { useMasterItemsByCode } from '@/hooks/catalog/useMasterItemsByCode';
import { useLiveCatalogPrices }   from '@/hooks/catalog/useLiveCatalogPrices';
import { useCrossStoreStockCodes } from '@/hooks/catalog/useCrossStoreStockCodes';
import { useCountries, useStates, useCities } from '@/hooks/settings/useLocation';
import ProductCard from '@/components/features/catalog/ProductCard';
import { Badge } from '@/components/ui/badge';
import Logo from '@/components/shared/Logo';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { formatDateNumeric, todayDateString } from '@/lib/dateUtils';
import Link from 'next/link';
import { formatMobileWithCountryCode } from '@/lib/phoneFormat';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = formatAmountOrDash;
const fmtDate = formatDateNumeric;
const TABS    = ['profile', 'edit', 'schemes', 'points', '360', 'wishlist', 'RecentlyViewed', 'ticketing'];
const TEXT_TABS = ['profile', 'edit', 'schemes', 'points', '360'];
const TAB_LABELS = {
  profile:  'Profile',
  edit:     'Edit',
  schemes:  'Schemes',
  points:   'Points',
  '360':    '360',
  wishlist: 'Wishlist',
  RecentlyViewed: 'Recently Viewed',
  ticketing: 'Ticketing',
};

const DOC_TYPES = [
  { key: 'order',    label: 'Order',        icon: ShoppingCart },
  { key: 'invoice',  label: 'Invoice',      icon: FileText },
  { key: 'return',   label: 'Return',       icon: RotateCcw },
  { key: 'urd',      label: 'URD Purchase', icon: Coins },
  { key: 'exchange', label: 'Exchange',     icon: ArrowLeftRight },
  { key: 'buyback',  label: 'Buy Back',     icon: Gem },
  { key: 'receipt',  label: 'Receipt',      icon: Receipt },
];

const INSIGHT_ICON = {
  preference:         Star,
  open_order_balance: ShoppingCart,
};

function fmtWeight(grams) {
  if (grams == null) return null;
  return `${Number(grams).toFixed(3)} g`;
}

// ── Shared primitives ─────────────────────────────────────────────────────────
function TabLoading({ label }) {
  return <InlineLoader className="py-12" label={label} />;
}
function TabError({ label, onRetry }) {
  return <ErrorState className="py-12" title={label} onRetry={onRetry} />;
}
function TabEmpty({ icon, label }) {
  return <EmptyState className="border-0 py-12" icon={icon} title={label} />;
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ customer }) {
  const { customerId, customerName, customerMobile, customerEmail, customerPan, taxNo, customerAddress, raw } = customer;
  const partyCode  = raw?.party_code && raw.party_code !== 'NA' ? raw.party_code : null;
  const birthDate  = raw?.birth_date  ? fmtDate(raw.birth_date)  : null;
  const anniversary= raw?.anniversary ? fmtDate(raw.anniversary) : null;

  const oneviewMobile = customerMobile?.replace(/\D/g, '').slice(-10) || null;
  const oneviewBaseUrl = process.env.NEXT_PUBLIC_ONEVIEW_BASE_URL;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {customerMobile && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Phone size={15} className="shrink-0 text-muted-foreground/70" />
          {formatMobileWithCountryCode(customerMobile)}
        </div>
      )}
      {customerEmail && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail size={15} className="shrink-0 text-muted-foreground/70" />
          <span className="truncate">{customerEmail}</span>
        </div>
      )}
      {customerAddress && (customerAddress.address || customerAddress.city) && (
        <div className="flex items-start gap-2 text-muted-foreground">
          <MapPin size={15} className="shrink-0 text-muted-foreground/70 mt-0.5" />
          <span>
            {[customerAddress.address, customerAddress.city, customerAddress.state, customerAddress.zip]
              .filter(Boolean).join(', ')}
          </span>
        </div>
      )}
      {customerPan && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <CreditCard size={15} className="shrink-0 text-muted-foreground/70" />
          PAN: {customerPan}
        </div>
      )}
      {taxNo && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <CreditCard size={15} className="shrink-0 text-muted-foreground/70" />
          GSTIN: {taxNo}
        </div>
      )}
      {partyCode && (
        <p className="text-xs text-muted-foreground/70">Customer code: {partyCode}</p>
      )}
      {birthDate && (
        <p className="text-xs text-muted-foreground">Birthday: {birthDate}</p>
      )}
      {anniversary && (
        <p className="text-xs text-muted-foreground">Anniversary: {anniversary}</p>
      )}
      {customerId != null && oneviewMobile && oneviewBaseUrl && (
        <Button type="button" variant="secondary" size="sm" className="self-start gap-1.5" onClick={async () => {
          const win = window.open('', '_blank');
          try {
            const res =  await fetch('/api/oneview/token', {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ partyId: customerId, mobile: oneviewMobile }),
            });
            if(!res.ok) throw new Error(`Token request failed: ${res.status}`);
            const { token } = await res.json();
            if(win) win.location = `${oneviewBaseUrl}/${customerId}?token=${token}`
          } catch (err) {
            console.error('[Oneview] failed to open', err);
            win?.close();
          }
        }}>
          <Orbit size={14} aria-hidden="true" />
          Oneview
        </Button>
      )}
    </div>
  );
}

// ── Edit Tab ──────────────────────────────────────────────────────────────────
// OrnaVerse returns birth_date/anniversary as a full ISO datetime
// ("2026-12-05T00:00:00.000") — <input type="date"> needs just the date part.
function toDateInputValue(iso) {
  return iso ? String(iso).slice(0, 10) : '';
}

function EditTab({ customer, onSaved }) {
  const updateCustomer = useUpdateCustomer();
  const raw = customer.raw;
  const schema = useMemo(() => buildUpdateCustomerSchema(raw), [raw]);

  const {
    register, handleSubmit, control, watch, setValue, reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      party_name:  raw?.party_name  ?? '',
      mobile:      storedValueToPhone(raw?.mobile),
      phone:       storedValueToPhone(raw?.phone),
      email:       raw?.email && raw.email !== 'NA' ? raw.email : '',
      pan_no:      raw?.pan_no && raw.pan_no !== 'NA' ? raw.pan_no : '',
      tax_no:      raw?.tax_no && raw.tax_no !== 'NA' ? raw.tax_no : '',
      passport_number: raw?.passport_number && raw.passport_number !== 'NA' ? raw.passport_number : '',
      aadhaar_number:  raw?.aadhaar_number ? String(raw.aadhaar_number) : '',
      dl_number:   raw?.dl_number && raw.dl_number !== 'NA' ? raw.dl_number : '',
      address:     raw?.address     ?? '',
      address_1:   raw?.address_1   ?? '',
      country_id:  raw?.country_id  ?? null,
      state_id:    raw?.state_id    ?? null,
      city_id:     raw?.city_id     ?? null,
      nationality_id: raw?.nationality_id ?? null,
      pin_code:    raw?.pin_code ? String(raw.pin_code) : '',
      birth_date:  toDateInputValue(raw?.birth_date),
      anniversary: toDateInputValue(raw?.anniversary),
      gender:         raw?.gender         || null,
      marital_status: raw?.marital_status || null,
      religion_id:    raw?.religion_id    || null,
      allow_credit:   raw?.allow_credit   ?? false,
      credit_limit:   raw?.credit_limit ? String(raw.credit_limit) : '',
    },
  });

  const allowCredit = watch('allow_credit');

  const loadedPartyIdRef = useRef(null);
  useEffect(() => {
    if (!raw || loadedPartyIdRef.current === raw.party_id) return;
    loadedPartyIdRef.current = raw.party_id;
    reset({
      party_name:  raw?.party_name  ?? '',
      mobile:      storedValueToPhone(raw?.mobile),
      phone:       storedValueToPhone(raw?.phone),
      email:       raw?.email && raw.email !== 'NA' ? raw.email : '',
      pan_no:      raw?.pan_no && raw.pan_no !== 'NA' ? raw.pan_no : '',
      tax_no:      raw?.tax_no && raw.tax_no !== 'NA' ? raw.tax_no : '',
      passport_number: raw?.passport_number && raw.passport_number !== 'NA' ? raw.passport_number : '',
      aadhaar_number:  raw?.aadhaar_number ? String(raw.aadhaar_number) : '',
      dl_number:   raw?.dl_number && raw.dl_number !== 'NA' ? raw.dl_number : '',
      address:     raw?.address     ?? '',
      address_1:   raw?.address_1   ?? '',
      country_id:  raw?.country_id  ?? null,
      state_id:    raw?.state_id    ?? null,
      city_id:     raw?.city_id     ?? null,
      nationality_id: raw?.nationality_id ?? null,
      pin_code:    raw?.pin_code ? String(raw.pin_code) : '',
      birth_date:  toDateInputValue(raw?.birth_date),
      anniversary: toDateInputValue(raw?.anniversary),
      gender:         raw?.gender         || null,
      marital_status: raw?.marital_status || null,
      religion_id:    raw?.religion_id    || null,
      allow_credit:   raw?.allow_credit   ?? false,
      credit_limit:   raw?.credit_limit ? String(raw.credit_limit) : '',
    });
  }, [raw, reset]);

  const countryId = watch('country_id');
  const stateId   = watch('state_id');
  useEffect(() => {
    if (countryId !== raw?.country_id) {
      setValue('state_id', null);
      setValue('city_id', null);
    }
  }, [countryId, raw?.country_id, setValue]);

  useEffect(() => {
    if (stateId !== raw?.state_id) {
      setValue('city_id', null);
    }
  }, [stateId, raw?.state_id, setValue]);

  const { countries, isLoading: countriesLoading } = useCountries();
  const { states,    isLoading: statesLoading }    = useStates(countryId);
  const { cities,    isLoading: citiesLoading }    = useCities(stateId);

  const onSubmit = async (formChanges) => {
    await updateCustomer.mutateAsync({
      partyId:     customer.customerId,
      originalRaw: raw,
      formChanges,
    });
    onSaved?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_name">Full name <span className="text-destructive">*</span></Label>
          <Input id="ep_name" {...register('party_name')} className="h-11" />
          {errors.party_name && <p className="text-sm text-destructive">{errors.party_name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_mobile">Mobile <span className="text-destructive">*</span></Label>
          {isMaskedValue(raw?.mobile) ? (
            <Input id="ep_mobile" value={formatMobileWithCountryCode(raw.mobile)} disabled className="h-11" />
          ) : (
            <Controller
              name="mobile"
              control={control}
              render={({ field }) => (
                <PhoneNumberField id="ep_mobile" value={field.value} onChange={field.onChange} />
              )}
            />
          )}
          {errors.mobile && <p className="text-sm text-destructive">{errors.mobile.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
          {isMaskedValue(raw?.phone) ? (
            <Input id="ep_phone" value={formatMobileWithCountryCode(raw.phone)} disabled className="h-11" />
          ) : (
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneNumberField id="ep_phone" value={field.value} onChange={field.onChange} />
              )}
            />
          )}
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_email">Email</Label>
          <Input id="ep_email" type="email" {...register('email')} className="h-11" />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_pan">PAN</Label>
          <Input id="ep_pan" {...register('pan_no')} disabled={isMaskedValue(raw?.pan_no)} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.pan_no && <p className="text-sm text-destructive">{errors.pan_no.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_tax_no">GSTIN <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ep_tax_no" {...register('tax_no')} disabled={isMaskedValue(raw?.tax_no)} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.tax_no && <p className="text-sm text-destructive">{errors.tax_no.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_passport_number">Passport No <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ep_passport_number" {...register('passport_number')} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.passport_number && <p className="text-sm text-destructive">{errors.passport_number.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_aadhaar_number">Aadhaar No <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ep_aadhaar_number" type="text" inputMode="numeric" maxLength={12} {...register('aadhaar_number')} disabled={isMaskedValue(raw?.aadhaar_number ? String(raw.aadhaar_number) : '')} className="h-11" />
          {errors.aadhaar_number && <p className="text-sm text-destructive">{errors.aadhaar_number.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_dl_number">Driving License <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ep_dl_number" {...register('dl_number')} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.dl_number && <p className="text-sm text-destructive">{errors.dl_number.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_pin">PIN Code</Label>
          <Input id="ep_pin" type="text" inputMode="numeric" {...register('pin_code')} className="h-11" maxLength={6} />
          {errors.pin_code && <p className="text-sm text-destructive">{errors.pin_code.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Country</Label>
          <LocationSelect
            control={control}
            name="country_id" items={countries} idKey="country_id" labelKey="country_name"
            placeholder="Select country" isLoading={countriesLoading}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>State</Label>
          <LocationSelect
            control={control}
            name="state_id" items={states} idKey="state_id" labelKey="state_name"
            placeholder="Select state" disabled={!countryId} disabledPlaceholder="Select country first"
            isLoading={statesLoading}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>City</Label>
          <LocationSelect
            control={control}
            name="city_id" items={cities} idKey="city_id" labelKey="city_name"
            placeholder="Select city" disabled={!stateId} disabledPlaceholder="Select state first"
            isLoading={citiesLoading}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Nationality <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <LocationSelect
            control={control}
            name="nationality_id" items={countries} idKey="country_id" labelKey="country_name"
            placeholder="Select nationality" isLoading={countriesLoading}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_birth_date">Birth Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ep_birth_date" type="date" max={todayDateString()} {...register('birth_date')} className="h-11" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_anniversary">Anniversary <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ep_anniversary" type="date" max={todayDateString()} {...register('anniversary')} className="h-11" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Gender <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Controller
            name="gender"
            control={control}
            render={({ field }) => (
              <Select value={field.value != null ? String(field.value) : ''} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => <SelectItem key={g.value} value={String(g.value)}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Marital status <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Controller
            name="marital_status"
            control={control}
            render={({ field }) => (
              <Select value={field.value != null ? String(field.value) : ''} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select marital status" /></SelectTrigger>
                <SelectContent>
                  {MARITAL_STATUS_OPTIONS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Religion <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Controller
            name="religion_id"
            control={control}
            render={({ field }) => (
              <Select value={field.value != null ? String(field.value) : ''} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Select religion" /></SelectTrigger>
                <SelectContent>
                  {RELIGION_OPTIONS.map((r) => <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Address</Label>
        <Input {...register('address')} className="h-11" placeholder="Address line 1" />
        <Input {...register('address_1')} className="h-11" placeholder="Address line 2 (optional)" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>PAN Document</Label>
        <PanDocumentUpload
          customerId={customer.customerId}
          customerName={customer.customerName}
          originalRaw={raw}
          savedPath={customer.customerPanDocument}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Controller
            name="allow_credit"
            control={control}
            render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}
          />
          <span className="text-sm text-foreground">Allow credit</span>
        </label>
        {allowCredit && (
          <Input id="ep_credit_limit" type="number" inputMode="numeric" placeholder="Credit limit" {...register('credit_limit')} className="h-11" />
        )}
      </div>

      <Button type="submit" disabled={updateCustomer.isPending || !isDirty} className="h-11 mt-1">
        {updateCustomer.isPending ? 'Saving…' : 'Save Changes'}
      </Button>
    </form>
  );
}

// ── Schemes Tab ───────────────────────────────────────────────────────────────
function SchemesTab({ customerId }) {
  const { enrollments, isLoading, isError, refetch } = useCustomerEnrollments({ customerId });

  if (isLoading) return <TabLoading label="Loading schemes…" />;
  if (isError)   return <TabError label="Failed to load schemes." onRetry={refetch} />;
  if (!enrollments.length) return <TabEmpty icon={BookOpen} label="No scheme enrollments." />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {enrollments.map((e, idx) => (
        <div key={e.enrollmentId ?? idx} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{e.schemeName ?? 'Scheme'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmt(e.schemeAmount)}/month · {e.tenure} months
              {e.enrolledDate ? ` · ${fmtDate(e.enrolledDate)}` : ''}
            </p>
            {e.investedAmount != null && (
              <p className="text-xs text-muted-foreground mt-0.5">Paid: {fmt(e.investedAmount)}</p>
            )}
            {e.nominee && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Nominee: {e.nominee}{e.nomineeAge != null ? ` (${e.nomineeAge} yrs)` : ''}
              </p>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
            e.status === 'cancelled'
              ? 'bg-status-error/10 text-status-error'
              : e.status === 'active'
                ? 'bg-status-in-stock/10 text-status-in-stock'
                : (e.status === 'matured' || e.status === 'redeemed')
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-muted text-muted-foreground'
          }`}>
            {e.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function InsightCard({ insight }) {
  const Icon = INSIGHT_ICON[insight.kind] ?? Info;
  const elevated = insight.severity === 'high' || insight.severity === 'critical';

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border p-3 ${
        elevated ? 'border-status-error/30 bg-status-error/5' : 'border-accent/30 bg-accent/5'
      }`}
    >
      <Icon
        size={16}
        className={`shrink-0 mt-0.5 ${elevated ? 'text-status-error' : 'text-accent'}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{insight.title}</p>
        {insight.detail && <p className="text-xs text-muted-foreground mt-0.5">{insight.detail}</p>}
      </div>
    </div>
  );
}

function DocumentRow({ doc }) {
  const weight = fmtWeight(doc.net_weight ?? doc.weight);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{doc.document_no ?? '—'}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {doc.document_date ? fmtDate(doc.document_date) : '—'}
          {doc.pieces != null ? ` · ${doc.pieces} pc` : ''}
          {weight ? ` · ${weight}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        {doc.net_amount != null && <p className="text-sm font-semibold text-foreground">{fmt(doc.net_amount)}</p>}
        {doc.balance_amount > 0 && <p className="text-xs text-status-error">Due {fmt(doc.balance_amount)}</p>}
      </div>
    </div>
  );
}

function Customer360Tab({ customerId }) {
  const { insights, documents, totals, isLoading, isError, refetch } = useCustomer360(customerId);
  const [docType, setDocType] = useState('order');

  if (isLoading) return <TabLoading label="Loading customer 360…" />;
  if (isError)   return <TabError label="Failed to load customer 360." onRetry={refetch} />;

  const activeDocs = documents[docType] ?? [];
  const activeLabel = DOC_TYPES.find((d) => d.key === docType)?.label ?? 'record';

  return (
    <div className="flex flex-col gap-4">

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground/70">Total Earnings</p>
          <p className="text-sm font-semibold text-status-in-stock mt-0.5">{fmt(totals.invoiceTotal)}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground/70">Credit Balance</p>
          <p className={`text-sm font-semibold mt-0.5 ${totals.creditBalance < 0 ? 'text-status-error' : 'text-foreground'}`}>
            {fmt(totals.creditBalance)}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground/70">Invoices</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{documents.invoice.length}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground/70">Orders</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{documents.order.length}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground/70">Returns</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{documents.return.length}</p>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sales Insights</p>
          {insights.map((insight, idx) => (
            <InsightCard key={insight.title ?? idx} insight={insight} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <PillTabs
          tabs={DOC_TYPES}
          value={docType}
          onChange={setDocType}
          variant="chip"
          scrollable
          className="-mx-1 px-1"
        />
        {activeDocs.length === 0 ? (
          <TabEmpty icon={ClipboardList} label={`No ${activeLabel.toLowerCase()} records.`} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {activeDocs.map((doc, idx) => (
              <DocumentRow key={doc.transaction_id ?? doc.document_id ?? idx} doc={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// A large, safely-above-threshold synthetic cart — never submitted as a real
// document (Preview only ever quotes, it doesn't redeem; redemption happens
// when a real receipt row is later posted, see nectorService.js's own
// header), just enough to clear any tenant's configured min_invoice_value so
// the real available balance comes back instead of an eligibility
// rejection. Confirmed live 2026-10-08 against a real customer: coin_value
// came back identical (1100) for a probe of 50,000 and of 500,000 — Preview
// reflects the stored balance once the gate clears, it doesn't scale with
// cart size.
const LOYALTY_PROBE_AMOUNT = 1000000;

// Same hook, same two endpoints (GetSettings + Preview) checkout's own
// Nector Loyalty tile calls — reported directly (2026-10-08): this card used
// to read a completely different, unrelated upstream (the Shopify storefront
// webhook) and showed 0 for a customer checkout then showed 500 for. Pointing
// both at the one real OrnaVerse-native source closes that gap at the root,
// not just here — whatever checkout would quote is exactly what this shows.
function LucraCoinsCard({ customerMobile, customerId }) {
  const activeStoreId = useSelector(selectActiveStoreId);

  const { data: loyaltySettings } = useQuery({
    queryKey: QUERY_KEYS.NECTOR.LOYALTY_CHECKOUT_SETTINGS(activeStoreId),
    queryFn: () => getLoyaltyCheckoutSettings(activeStoreId),
    enabled: !!activeStoreId,
    staleTime: 5 * 60 * 1000, // near-static, same as checkout's own settings query
  });
  const isThirdParty = isThirdPartyLoyalty(loyaltySettings);
  const probeItemGroup = loyaltySettings?.item_groups?.[0] ?? null;

  const { promotion, isLoading } = useNectorCheckoutInfo(
    {
      mobile: customerMobile,
      companyId: activeStoreId,
      partyId: customerId,
      netAmount: LOYALTY_PROBE_AMOUNT,
      remainingDue: LOYALTY_PROBE_AMOUNT,
      lineItems: probeItemGroup != null
        ? [{ item_group_id: probeItemGroup, taxable_amount: LOYALTY_PROBE_AMOUNT }]
        : [],
    },
    { enabled: !!customerMobile && !!customerId && !!activeStoreId && !!loyaltySettings && isThirdParty }
  );

  const points = promotion?.coin_value ?? 0;
  const notConfigured = !!loyaltySettings && !isThirdParty;
  const settingsLoading = !!activeStoreId && loyaltySettings === undefined;

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-amber-50 to-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Lucira Coins Balance</p>
          <p className="text-xs text-muted-foreground mt-0.5">1 Coin = 1 Rupee</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5 shrink-0">
          <Coins size={16} className="text-amber-500" aria-hidden="true" />
          <span className="text-base font-bold text-foreground tabular-nums">
            {!customerMobile || settingsLoading || isLoading ? '—' : points.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
      {!customerMobile && (
        <p className="text-xs text-muted-foreground">No mobile number on file for this customer.</p>
      )}
      {customerMobile && notConfigured && (
        <p className="text-xs text-muted-foreground">Loyalty points aren&apos;t configured for this store.</p>
      )}
    </div>
  );
}

function PointsTab({ customerMobile, customerId }) {
  return (
    <div className="flex flex-col gap-3">
      <LucraCoinsCard customerMobile={customerMobile} customerId={customerId} />
    </div>
  );
}

// Same flag shape/position ProductCard's own StockBadge uses (left-0,
// rounded flag) — one consistent badge system, not a foreign label bolted on.
function WebsiteFlag({ stacked }) {
  return (
    <div className={`absolute left-0 z-10 ${stacked ? 'top-10' : 'top-3'}`}>
      <Badge className="h-auto rounded-l-none rounded-r-full bg-primary/95 py-0.5 pl-2 pr-2.5 text-[10px] font-semibold text-primary-foreground shadow-sm sm:py-1 sm:pl-2.5 sm:pr-3 sm:text-[11px]">
        On website
      </Badge>
    </div>
  );
}

// A website item with no resolvable OrnaVerse item_id — matches ProductCard's
// own layout/typography exactly (same rounded-2xl card, image aspect, price
// and title treatment) so the grid reads as one consistent system, but isn't
// a button: there's nowhere real for it to navigate to.
function WebsiteItemCard({ title, image, price, comparePrice, meta }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm">
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={title ?? ''} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted">
            <Logo variant="icon" color="brown" width={32} height={32} className="opacity-40" />
            <span className="text-[10px] text-muted-foreground/60 tracking-wide">No image</span>
          </div>
        )}
        <WebsiteFlag stacked={false} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 border-t border-border p-2.5 sm:p-3.5">
        <span className="min-h-4 text-xs sm:block hidden text-muted-foreground">{meta ?? ' '}</span>
        {price != null ? (
          <p className="flex flex-wrap items-baseline gap-x-1.5 font-sans text-sm font-bold text-foreground sm:text-base md:text-lg">
            {fmt(price)}
            {comparePrice != null && comparePrice > price && (
              <span className="text-[11px] font-medium text-muted-foreground line-through sm:text-xs">{fmt(comparePrice)}</span>
            )}
          </p>
        ) : (
          <p className="font-sans text-xs font-medium text-muted-foreground sm:text-sm">Price unavailable</p>
        )}
        <p className="line-clamp-3 min-h-10 text-xs sm:text-sm font-semibold leading-snug text-foreground">
          {title ?? 'Untitled product'}
        </p>
      </div>
    </div>
  );
}

function websiteWishlistToCard(item, idx) {
  return {
    key: `web-wishlist-${item.variantId ?? item.productId ?? idx}`,
    title: item.title,
    image: item.image,
    price: item.price ?? null,
    comparePrice: item.comparePrice ?? null,
    meta: [item.color, item.size].filter(Boolean).join(' · ') || null,
  };
}

function websiteCartToCard(item, idx) {
  return {
    key: `web-cart-${item.sku ?? item.variantId ?? idx}`,
    title: item.title,
    image: item.image,
    price: item.finalPrice ?? item.price ?? null,
    comparePrice: item.comparePrice ?? null,
    meta: [item.color, item.size].filter(Boolean).join(' · ') || null,
  };
}

// Only ~18% of website wishlist items and ~96% of website cart items carry a
// sku — the rest only have Shopify product/variant IDs, which don't resolve
// to a real OrnaVerse item_id without a much bigger per-style crawl. So a
// website item is only ever clickable/add-to-cart-able when its sku matches
// a real catalog row; everything else stays a plain read-only reference card.
function partitionWebsiteItems(webItems, resolve) {
  const matched = [];
  const unmatched = [];
  for (const item of webItems) {
    const row = resolve(item);
    if (row) matched.push(row);
    else unmatched.push(item);
  }
  return { matched, unmatched };
}

function WebsiteProductCard({ catalogRow, price, isPricing, realStock }) {
  const showStockBadge = realStock != null;
  return (
    <div className="relative">
      <WebsiteFlag stacked={showStockBadge} />
      <ProductCard
        product={{ ...catalogRow, price, is_pricing: isPricing }}
        showStockBadge={showStockBadge}
        realStock={realStock}
      />
    </div>
  );
}

// ── Wishlist Tab ──────────────────────────────────────────────────────────────
function WishlistTab({ customerId, customerMobile, customerEmail }) {
  const activeStoreId = useSelector(selectActiveStoreId);
  const { items, isLoading, isError } = useCustomerWishlist(customerId, customerMobile);
  const { wishlist: webWishlist, cart: webCart, abandonedCart: webAbandonedCart } = useWebsiteActivity(customerId, customerMobile, customerEmail);
  const { data: catalog = [] } = useAllCatalog(activeStoreId);
  const skuIndex = useMemo(() => buildSkuIndex(catalog), [catalog]);

  const { matched: matchedWishlist, unmatched: unmatchedWishlist } = useMemo(
    () => partitionWebsiteItems(webWishlist, (item) => matchBySku(item.sku, skuIndex)), [webWishlist, skuIndex],
  );
  const { matched: matchedCart, unmatched: unmatchedCart } = useMemo(
    () => partitionWebsiteItems(webCart, (item) => matchBySku(item.sku, skuIndex)), [webCart, skuIndex],
  );
  const { matched: matchedAbandoned, unmatched: unmatchedAbandoned } = useMemo(
    () => partitionWebsiteItems(webAbandonedCart, (item) => matchBySku(item.sku, skuIndex)), [webAbandonedCart, skuIndex],
  );

  // Second tier — a sku that's real but just isn't assigned/stocked at THIS
  // store never shows up in the fast in-stock catalog cache above, even
  // though the item genuinely exists in OrnaVerse. A small, targeted master-
  // item lookup (not a full-catalog crawl) catches those.
  const unmatchedSkus = useMemo(
    () => [...unmatchedWishlist, ...unmatchedCart, ...unmatchedAbandoned].map((item) => item.sku).filter((sku) => sku?.trim()),
    [unmatchedWishlist, unmatchedCart, unmatchedAbandoned],
  );
  const masterItemBySku = useMasterItemsByCode(unmatchedSkus);
  const resolveViaMaster = (item) => masterItemBySku.get(item.sku) ?? null;
  const { matched: matchedWishlistMaster, unmatched: unmatchedWishlistFinal } = useMemo(
    () => partitionWebsiteItems(unmatchedWishlist, resolveViaMaster), [unmatchedWishlist, masterItemBySku],
  );
  const { matched: matchedCartMaster, unmatched: unmatchedCartFinal } = useMemo(
    () => partitionWebsiteItems(unmatchedCart, resolveViaMaster), [unmatchedCart, masterItemBySku],
  );
  const { matched: matchedAbandonedMaster, unmatched: unmatchedAbandonedFinal } = useMemo(
    () => partitionWebsiteItems(unmatchedAbandoned, resolveViaMaster), [unmatchedAbandoned, masterItemBySku],
  );

  // A duplicate website entry (same product wishlisted twice, also sitting in
  // the cart, or also abandoned) resolves to the same catalog row more than
  // once — render it as a single card, not a repeat.
  const matchedWeb = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of [
      ...matchedWishlist, ...matchedCart, ...matchedAbandoned,
      ...matchedWishlistMaster, ...matchedCartMaster, ...matchedAbandonedMaster,
    ]) {
      const key = `${row.item_id}-${row.item_size_id ?? 'base'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }, [matchedWishlist, matchedCart, matchedAbandoned, matchedWishlistMaster, matchedCartMaster, matchedAbandonedMaster]);

  const allPricedItems = useMemo(() => [...items, ...matchedWeb], [items, matchedWeb]);
  const { priceById, settledIds } = useLiveCatalogPrices(allPricedItems);
  const itemIds = useMemo(() => allPricedItems.map((i) => i.item_id), [allPricedItems]);
  const { stockByItemId, isLoading: stockLoading } = useCrossStoreStockCodes(itemIds);

  if (isLoading) return <TabLoading label="Loading wishlist…" />;
  if (isError)   return <TabError label="Failed to load wishlist." />;
  if (items.length === 0 && webWishlist.length === 0 && webCart.length === 0 && webAbandonedCart.length === 0) {
    return <TabEmpty icon={Heart} label="No wishlisted products yet." />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => {
        const price = priceById.get(item.item_id) ?? null;
        const isPricing = price == null && !settledIds.has(item.item_id);
        return (
          <ProductCard
            key={`${item.item_id}-${item.item_size_id ?? 'base'}`}
            product={{ ...item, price, is_pricing: isPricing }}
            showStockBadge={!stockLoading}
            realStock={stockByItemId.get(item.item_id) ?? null}
          />
        );
      })}
      {matchedWeb.map((row) => {
        const price = priceById.get(row.item_id) ?? null;
        const isPricing = price == null && !settledIds.has(row.item_id);
        return (
          <WebsiteProductCard
            key={`web-matched-${row.item_id}-${row.item_size_id ?? 'base'}`}
            catalogRow={row}
            price={price}
            isPricing={isPricing}
            realStock={stockLoading ? null : stockByItemId.get(row.item_id) ?? null}
          />
        );
      })}
      {unmatchedWishlistFinal.map((item, idx) => {
        const { key, ...card } = websiteWishlistToCard(item, idx);
        return <WebsiteItemCard key={key} {...card} />;
      })}
      {unmatchedCartFinal.map((item, idx) => {
        const { key, ...card } = websiteCartToCard(item, idx);
        return <WebsiteItemCard key={key} {...card} meta={`In cart on website${card.meta ? ` · ${card.meta}` : ''}`} />;
      })}
      {unmatchedAbandonedFinal.map((item, idx) => {
        const { key, ...card } = websiteCartToCard(item, idx);
        return <WebsiteItemCard key={`abandoned-${key}`} {...card} meta={`Abandoned cart on website${card.meta ? ` · ${card.meta}` : ''}`} />;
      })}
    </div>
  );
}

// ── Recently Viewed Tab ───────────────────────────────────────────────────────
function RecentlyViewedTab({ customerId, customerMobile, customerEmail }) {
  const { items, isLoading, isError } = useCustomerRecentlyViewed(customerId, customerMobile);
  const { priceById, settledIds } = useLiveCatalogPrices(items);
  const itemIds = useMemo(() => items.map((i) => i.item_id), [items]);
  const { stockByItemId, isLoading: stockLoading } = useCrossStoreStockCodes(itemIds);
  const { recentlyViewed: webViewed } = useWebsiteActivity(customerId, customerMobile, customerEmail);

  if (isLoading) return <TabLoading label="Loading recently viewed…" />;
  if (isError)   return <TabError label="Failed to load recently viewed products." />;
  if (items.length === 0 && webViewed.length === 0) {
    return <TabEmpty icon={History} label="No recently viewed products yet." />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => {
        const price = priceById.get(item.item_id) ?? null;
        const isPricing = price == null && !settledIds.has(item.item_id);
        return (
          <ProductCard
            key={`${item.item_id}-${item.item_size_id ?? 'base'}`}
            product={{ ...item, price, is_pricing: isPricing }}
            showStockBadge={!stockLoading}
            realStock={stockByItemId.get(item.item_id) ?? null}
          />
        );
      })}
      {webViewed.map((view, idx) => (
        <WebsiteItemCard
          key={`web-viewed-${view.variantId ?? idx}`}
          title={view.title}
          image={null}
          price={null}
          meta={view.timestamp ? `Viewed on website · ${fmtDate(view.timestamp)}` : 'Viewed on website'}
        />
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomerDetailPage() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const partyId      = Number(params?.customerId);
  const fallbackCustomerName = searchParams.get('name');
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  // 'edit' no longer admin-only (2026-10-12) — same reasoning, and the same
  // live confirmation on OrnaVerse's own non-admin operator session, as the
  // CustomerDetailSheet/proxy gates already removed: editing a customer
  // (including PAN, a compliance-mandatory field above a sale threshold)
  // works there with no permission error. This page's own 'edit' tab had an
  // independent gate those earlier fixes never touched, blocking the exact
  // same routine action through this entry point only. '360' stays
  // admin-only — a separate analytics view, no evidence OrnaVerse treats it
  // the same way.
  const visibleTabs = isSuperAdmin ? TABS : TABS.filter((t) => t !== '360');
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get('tab');
    if (requested && visibleTabs.includes(requested)) return requested;
    return isSuperAdmin ? 'edit' : 'profile';
  });

  const { customer, isLoading, isError, refetch } = useRetrieveCustomer(partyId, {
    enabled: !!partyId,
  });

  const { customerId: attachedCustomerId } = useCustomerSession();
  const wasAttachedRef = useRef(false);
  useEffect(() => {
    if (attachedCustomerId === partyId) {
      wasAttachedRef.current = true;
    } else if (wasAttachedRef.current) {
      router.replace('/dashboard');
    }
  }, [attachedCustomerId, partyId, router]);

  const handleSaved = () => {
    refetch();
  };

  return (
    <div className="p-4 pb-8 flex flex-col gap-4 w-full">
      {isLoading && (
        <InlineLoader
          className="py-16"
          label={fallbackCustomerName ? `Loading ${fallbackCustomerName}'s profile…` : 'Loading customer…'}
        />
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-destructive">
            {fallbackCustomerName ? `Failed to load ${fallbackCustomerName}'s profile.` : 'Failed to load customer.'}
          </p>
          <Button type="button" variant="outline" onClick={refetch}>Retry</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      )}

      {customer && !isLoading && (
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-4 shadow-sm">
          <div className='flex align-top justify-start gap-4'>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard')}
              aria-label="Back to dashboard"
              className="h-9 w-9 -ml-2 shrink-0"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Button>
            <div>
              <h2 className="text-base font-bold text-foreground">{customer.customerName ?? fallbackCustomerName}</h2>
              {customer.raw?.party_code && customer.raw.party_code !== 'NA' && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">Code: {customer.raw.party_code}</p>
              )}
            </div>
          </div>
          
          <PillTabs
            tabs={visibleTabs}
            value={activeTab}
            onChange={setActiveTab}
            getKey={(t) => t}
            getLabel={(t) => TAB_LABELS[t]}
            variant="chip"
            scrollable
            className="-mx-1 px-1"
          />
          <div className={TEXT_TABS.includes(activeTab) ? 'max-w-full w-full' : 'w-full'}>
            {activeTab === 'profile' && <ProfileTab customer={customer} />}
            {activeTab === 'edit'    && <EditTab customer={customer} onSaved={handleSaved} />}
            {activeTab === 'schemes' && <SchemesTab customerId={customer.customerId} />}
            {activeTab === 'points'  && <PointsTab customerMobile={customer.customerMobile} customerId={customer.customerId} />}
            {activeTab === '360'     && isSuperAdmin && <Customer360Tab customerId={customer.customerId} />}
            {activeTab === 'wishlist' && <WishlistTab customerId={customer.customerId} customerMobile={customer.customerMobile} customerEmail={customer.customerEmail} />}
            {activeTab === 'RecentlyViewed' && <RecentlyViewedTab customerId={customer.customerId} customerMobile={customer.customerMobile} customerEmail={customer.customerEmail} />}
            {activeTab === 'ticketing' && <TicketList partyId={customer.customerId} />}
          </div>

        </div>
      )}
    </div>
  );
}
