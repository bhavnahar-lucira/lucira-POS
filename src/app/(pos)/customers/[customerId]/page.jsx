'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Phone, Mail, MapPin, CreditCard,
  ClipboardList, BookOpen,
  ShoppingCart, FileText, RotateCcw, ArrowLeftRight, Coins, Gem, Receipt, Star, Info, Heart, History,
} from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSelector } from 'react-redux';
import PhoneNumberField from '@/components/shared/PhoneNumberField';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';

import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import LocationSelect from '@/components/shared/LocationSelect';
import PanDocumentUpload from '@/components/shared/PanDocumentUpload';
import PillTabs from '@/components/shared/PillTabs';
import EmptyState from '@/components/shared/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import InlineLoader from '@/components/shared/InlineLoader';

import { updateCustomerSchema }   from '@/validators/customerSchema';
import { storedValueToPhone }     from '@/lib/normalizers/customer';
import { useRetrieveCustomer }    from '@/hooks/customer/useRetrieveCustomer';
import { useUpdateCustomer }      from '@/hooks/customer/useUpdateCustomer';
import { useCustomerEnrollments } from '@/hooks/customer/useCustomerEnrollments';
import { useNectorLoyaltyPoints } from '@/hooks/customer/useNectorLoyaltyPoints';
import { useCustomer360 }         from '@/hooks/customer/useCustomer360';
import { useCustomerWishlist }    from '@/hooks/customer/useCustomerWishlist';
import { useCustomerRecentlyViewed } from '@/hooks/customer/useCustomerRecentlyViewed';
import { useLiveCatalogPrices }   from '@/hooks/catalog/useLiveCatalogPrices';
import { useCrossStoreStockCodes } from '@/hooks/catalog/useCrossStoreStockCodes';
import { useCountries, useStates, useCities } from '@/hooks/settings/useLocation';
import ProductCard from '@/components/features/catalog/ProductCard';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { formatDateNumeric } from '@/lib/dateUtils';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = formatAmountOrDash;
const fmtDate = formatDateNumeric;
const TABS    = ['profile', 'edit', 'schemes', 'points', '360', 'wishlist', 'RecentlyViewed'];
const TEXT_TABS = ['profile', 'edit', 'schemes', 'points', '360'];
const TAB_LABELS = {
  profile:  'Profile',
  edit:     'Edit',
  schemes:  'Schemes',
  points:   'Points',
  '360':    '360',
  wishlist: 'Wishlist',
  RecentlyViewed: 'Recently Viewed',
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
  const { customerName, customerMobile, customerEmail, customerPan, taxNo, customerAddress, raw } = customer;
  const partyCode  = raw?.party_code && raw.party_code !== 'NA' ? raw.party_code : null;
  const birthDate  = raw?.birth_date  ? fmtDate(raw.birth_date)  : null;
  const anniversary= raw?.anniversary ? fmtDate(raw.anniversary) : null;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {customerMobile && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Phone size={15} className="shrink-0 text-muted-foreground/70" />
          {customerMobile}
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
    </div>
  );
}

// ── Edit Tab ──────────────────────────────────────────────────────────────────
function EditTab({ customer, onSaved }) {
  const updateCustomer = useUpdateCustomer();
  const raw = customer.raw;

  const {
    register, handleSubmit, control, watch, setValue, reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(updateCustomerSchema),
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
    },
  });
  
  useEffect(() => {
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
          <Controller
            name="mobile"
            control={control}
            render={({ field }) => (
              <PhoneNumberField id="ep_mobile" value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.mobile && <p className="text-sm text-destructive">{errors.mobile.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <PhoneNumberField id="ep_phone" value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_email">Email</Label>
          <Input id="ep_email" type="email" {...register('email')} className="h-11" />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_pan">PAN</Label>
          <Input id="ep_pan" {...register('pan_no')} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.pan_no && <p className="text-sm text-destructive">{errors.pan_no.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_tax_no">GSTIN <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ep_tax_no" {...register('tax_no')} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.tax_no && <p className="text-sm text-destructive">{errors.tax_no.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_passport_number">Passport No <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ep_passport_number" {...register('passport_number')} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.passport_number && <p className="text-sm text-destructive">{errors.passport_number.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep_aadhaar_number">Aadhaar No <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ep_aadhaar_number" type="text" inputMode="numeric" maxLength={12} {...register('aadhaar_number')} className="h-11" />
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

function LucraCoinsCard({ customerMobile }) {
  const { points, isFound, isLoading } = useNectorLoyaltyPoints(customerMobile, {
    enabled: !!customerMobile,
  });

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
            {!customerMobile || isLoading ? '—' : points.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
      {!customerMobile && (
        <p className="text-xs text-muted-foreground">No mobile number on file for this customer.</p>
      )}
      {customerMobile && !isLoading && !isFound && (
        <p className="text-xs text-muted-foreground">Not enrolled in Lucira Coins yet.</p>
      )}
    </div>
  );
}

function PointsTab({ customerMobile }) {
  return (
    <div className="flex flex-col gap-3">
      <LucraCoinsCard customerMobile={customerMobile} />
    </div>
  );
}

// ── Wishlist Tab ──────────────────────────────────────────────────────────────
function WishlistTab({ customerId, customerMobile }) {
  const { items, isLoading, isError } = useCustomerWishlist(customerId, customerMobile);
  const { priceById, settledIds } = useLiveCatalogPrices(items);
  const itemIds = useMemo(() => items.map((i) => i.item_id), [items]);
  const { stockByItemId, isLoading: stockLoading } = useCrossStoreStockCodes(itemIds);

  if (isLoading) return <TabLoading label="Loading wishlist…" />;
  if (isError)   return <TabError label="Failed to load wishlist." />;
  if (items.length === 0) return <TabEmpty icon={Heart} label="No wishlisted products yet." />;

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
    </div>
  );
}

// ── Recently Viewed Tab ───────────────────────────────────────────────────────
function RecentlyViewedTab({ customerId, customerMobile }) {
  const { items, isLoading, isError } = useCustomerRecentlyViewed(customerId, customerMobile);
  const { priceById, settledIds } = useLiveCatalogPrices(items);
  const itemIds = useMemo(() => items.map((i) => i.item_id), [items]);
  const { stockByItemId, isLoading: stockLoading } = useCrossStoreStockCodes(itemIds);

  if (isLoading) return <TabLoading label="Loading recently viewed…" />;
  if (isError)   return <TabError label="Failed to load recently viewed products." />;
  if (items.length === 0) return <TabEmpty icon={History} label="No recently viewed products yet." />;

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
  const visibleTabs = isSuperAdmin ? TABS : TABS.filter((t) => t !== 'edit');
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get('tab');
    if (requested && visibleTabs.includes(requested)) return requested;
    return isSuperAdmin ? 'edit' : 'profile';
  });

  const { customer, isLoading, isError, refetch } = useRetrieveCustomer(partyId, {
    enabled: !!partyId,
  });

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
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/customers')}>
            Back to Customers
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
              onClick={() => router.push('/customers')}
              aria-label="Back to customers"
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
            {activeTab === 'edit'    && isSuperAdmin && <EditTab customer={customer} onSaved={handleSaved} />}
            {activeTab === 'schemes' && <SchemesTab customerId={customer.customerId} />}
            {activeTab === 'points'  && <PointsTab customerMobile={customer.customerMobile} />}
            {activeTab === '360'     && <Customer360Tab customerId={customer.customerId} />}
            {activeTab === 'wishlist' && <WishlistTab customerId={customer.customerId} customerMobile={customer.customerMobile} />}
            {activeTab === 'RecentlyViewed' && <RecentlyViewedTab customerId={customer.customerId} customerMobile={customer.customerMobile} />}
          </div>

        </div>
      )}
    </div>
  );
}
