'use client';

// Quick-access sheet from the customer directory.
// TABS: Profile always; Edit ONLY once this customer is attached to the
// cart session (2026-09-07) — see the isAttached-gated `tabs` in the
// component below. Editing a customer's personal details shouldn't be
// something an associate can do to any record they merely browse; it
// requires the customer to actually be the one being served right now.
// Orders / Schemes / History / Points → full profile page (/customers/[customerId])
//
// Edit tab pre-fills from the customer prop (normalised shape from the list).
// useRetrieveCustomer fetches the full record in the background so the
// update payload is always complete (OrnaVerse requires full record on update).

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectIsSuperAdmin } from '@/store/slices/authSlice';
import {
  Phone, Mail, MapPin, CreditCard, UserCircle, History,
  Loader2,
} from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';

import BottomSheet from '@/components/shared/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import LocationSelect from '@/components/shared/LocationSelect';
import PhoneNumberField from '@/components/shared/PhoneNumberField';
import PillTabs from '@/components/shared/PillTabs';

import { updateCustomerSchema } from '@/validators/customerSchema';
import { storedValueToPhone } from '@/lib/normalizers/customer';
import { useRetrieveCustomer } from '@/hooks/customer/useRetrieveCustomer';
import { useUpdateCustomer } from '@/hooks/customer/useUpdateCustomer';
import { useCountries, useStates, useCities } from '@/hooks/settings/useLocation';

const TAB_LABELS = { profile: 'Profile', edit: 'Edit' };

// PAN shown in full (2026-09-08) — used to be masked here with a
// client-side maskPan(), on the assumption OrnaVerse itself masks it.
// Confirmed live against LIVE (Customer/Retrieve on several unrelated
// party_ids) that it does not — full PAN comes back, same as mobile/email.
// Masking it again client-side just hid real data staff already have full
// Retrieve access to, for no actual privacy benefit.
function ProfileTab({ customer, onAttach, isAttached, onClose }) {
  const { customerName, customerMobile, customerPhone, customerEmail, customerAddress, customerPan, taxNo, raw } = customer;
  const partyCode = raw?.party_code && raw.party_code !== 'NA' ? raw.party_code : null;
  // ROLLED BACK 2026-09-08 — the full-profile links below used to build a
  // name-first slug (/customers/tahir-kutty-12345); reverted to the plain
  // id route (/customers/[customerId]) after that broke loading the
  // profile entirely. The name is still passed through, just as a ?name=
  // query param instead of the URL path, so the destination page can show
  // it immediately (see that page's own fallbackCustomerName) without
  // needing it encoded into the route segment.
  const nameParam = customerName ? `name=${encodeURIComponent(customerName)}` : '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-sm">
        {customerMobile && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone size={15} className="shrink-0 text-muted-foreground/70" />
            {customerMobile}
          </div>
        )}
        {customerPhone && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone size={15} className="shrink-0 text-muted-foreground/70" />
            {customerPhone} <span className="text-xs">(phone)</span>
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
          <p className="text-xs text-muted-foreground/70">Code: {partyCode}</p>
        )}
      </div>

      <Button
        type="button"
        onClick={onAttach}
        disabled={isAttached}
        className="h-11 w-full"
      >
        {/* "Attach to Session" (2026-09-08) — matches CustomerSessionSheet's
            own button wording. This assigns the customer to the whole POS
            session, not just "the cart" specifically — the same customer
            then carries through checkout, order history, everywhere else
            the session is read, not something scoped to a cart alone. */}
        {isAttached ? 'Already assigned to session' : 'Assign to Session'}
      </Button>

      {/* Both links below only make sense once this customer is actually
          on the sale (2026-08-12) — before that, jumping to their full
          profile/360 has nothing to do with the cart in front of the
          operator, so the paths simply aren't shown yet. */}
      {isAttached && (
        <>
          <Button asChild type="button" variant="outline" className="h-11 w-full gap-2">
            <Link href={`/customers/${customer.customerId}${nameParam ? `?${nameParam}` : ''}`} onClick={onClose}>
              <UserCircle size={16} />
              View Full Profile
            </Link>
          </Button>

          {/* Jumps straight to the full profile page's '360' tab via
              ?tab=360, read on mount by that page (see
              customers/[customerId]/page.jsx). */}
          <Button asChild type="button" variant="outline" className="h-11 w-full gap-2">
            <Link href={`/customers/${customer.customerId}?tab=360${nameParam ? `&${nameParam}` : ''}`} onClick={onClose}>
              <History size={16} />
              Customer 360
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}

// REMOVED 2026-09-08 — this used to blank mobile/email/address in the edit
// form whenever the raw value "looked masked" (contained a literal '*'),
// on the assumption OrnaVerse pre-masks these fields on List/Retrieve (a
// real behavior, confirmed live against UAT 2026-07-19). Confirmed live
// against LIVE (Customer/Retrieve, several unrelated party_ids) that it
// does NOT mask there — full mobile/email/address come back every time,
// same finding that already removed PAN masking from ProfileTab above.
// Worse than just unnecessary: this was a live false-positive risk — any
// customer whose REAL address happens to contain a literal "*" (unit
// numbers, unusual formatting) would have been wrongly detected as
// "masked" and had their genuine address silently blanked out of the edit
// form, actively preventing staff from verifying or updating it. Every
// field below now always pre-fills with whatever OrnaVerse actually
// returns, no detection, no blanking.

function EditTab({ customer }) {
  const { customer: fullCustomer, isLoading: loadingFull } = useRetrieveCustomer(customer.customerId);
  const updateCustomer = useUpdateCustomer();

  const raw = fullCustomer?.raw ?? customer.raw;

  const {
    register, handleSubmit, control, watch, setValue, reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(updateCustomerSchema),
    // BUG FIX 2026-09-03: country_id/state_id/city_id (and address/
    // address_1/pin_code) used to default from `customer.customerAddress`
    // — a DISPLAY-only value picked from this customer's party_address[]
    // book (whichever entry is is_default, or just the first one) — while
    // the "only reset state/city when the user actually changes country"
    // guard below (initialCountryId/initialStateId) and the reset() effect
    // once the full record loads both correctly read the ROOT profile
    // fields instead. Editing Country/State/City here edits the ROOT
    // fields (that's what Update actually writes — there's no code path
    // that touches party_address[]), so seeding from a *different* source
    // than the one being compared/submitted was the bug. Confirmed live
    // against a real customer (Suryansh Gupta, party_id 1564): his root
    // profile is Djibouti/Ali Sabieh Region, but his one saved address is
    // India/Maharashtra — the mismatch meant State/City were wiped to null
    // the instant this tab opened, before the operator touched anything.
    defaultValues: {
      party_name: customer.customerName ?? '',
      mobile: storedValueToPhone(customer.customerMobile),
      phone: storedValueToPhone(customer.customerPhone),
      email: customer.customerEmail ?? '',
      pan_no: customer.customerPan ?? '',
      tax_no: customer.taxNo ?? '',
      passport_number: customer.passportNumber ?? '',
      aadhaar_number: customer.aadhaarNumber ? String(customer.aadhaarNumber) : '',
      dl_number: customer.dlNumber ?? '',
      address: customer.raw?.address ?? '',
      address_1: customer.raw?.address_1 ?? '',
      country_id: customer.raw?.country_id ?? null,
      state_id: customer.raw?.state_id ?? null,
      city_id: customer.raw?.city_id ?? null,
      nationality_id: customer.nationalityId ?? null,
      pin_code: customer.raw?.pin_code ? String(customer.raw.pin_code) : '',
    },
  });

  useEffect(() => {
    if (!fullCustomer?.raw) return;
    const r = fullCustomer.raw;
    reset({
      party_name: r.party_name ?? '',
      mobile: storedValueToPhone(r.mobile),
      phone: storedValueToPhone(r.phone),
      email: r.email && r.email !== 'NA' ? r.email : '',
      pan_no: r.pan_no && r.pan_no !== 'NA' ? r.pan_no : '',
      tax_no: r.tax_no && r.tax_no !== 'NA' ? r.tax_no : '',
      passport_number: r.passport_number && r.passport_number !== 'NA' ? r.passport_number : '',
      aadhaar_number: r.aadhaar_number ? String(r.aadhaar_number) : '',
      dl_number: r.dl_number && r.dl_number !== 'NA' ? r.dl_number : '',
      address: r.address ?? '',
      address_1: r.address_1 ?? '',
      country_id: r.country_id ?? null,
      nationality_id: r.nationality_id ?? null,
      state_id: r.state_id ?? null,
      city_id: r.city_id ?? null,
      pin_code: r.pin_code ? String(r.pin_code) : '',
    });
  }, [fullCustomer, reset]);

  const countryId = watch('country_id');
  const stateId = watch('state_id');

  // Only cascade-reset when user actually changes the value
  const initialCountryId = raw?.country_id ?? null;
  const initialStateId = raw?.state_id ?? null;
  useEffect(() => {
    if (countryId !== initialCountryId) {
      setValue('state_id', null);
      setValue('city_id', null);
    }
  }, [countryId, initialCountryId, setValue]);
  useEffect(() => {
    if (stateId !== initialStateId) {
      setValue('city_id', null);
    }
  }, [stateId, initialStateId, setValue]);

  const { countries, isLoading: countriesLoading } = useCountries();
  const { states, isLoading: statesLoading } = useStates(countryId);
  const { cities, isLoading: citiesLoading } = useCities(stateId);

  const onSubmit = async (formChanges) => {
    if (!raw) return;
    // mobile no longer needs a raw-value fallback here (FIXED 2026-09-26) —
    // it's a mandatory, validated field now (updateCustomerSchema's
    // mobileSchema), so a blank submission can no longer reach this point
    // at all. email/address stay optional, so a genuinely blank one still
    // falls back to the original rather than corrupting a required-shaped
    // OrnaVerse field with an empty string (there's no UI affordance here
    // for actually clearing either).
    await updateCustomer.mutateAsync({
      partyId: customer.customerId,
      originalRaw: raw,
      formChanges: {
        ...formChanges,
        email: formChanges.email || raw.email,
        address: formChanges.address || raw.address,
      },
    });
  };

  return (
    <div className="relative">
      {loadingFull && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Loader2 size={11} className="animate-spin" />
          Loading full details…
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ds_party_name">Full name <span className="text-destructive">*</span></Label>
          <Input id="ds_party_name" {...register('party_name')} className="h-11" />
          {errors.party_name && <p className="text-sm text-destructive">{errors.party_name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ds_mobile">Mobile <span className="text-destructive">*</span></Label>
          <Controller
            name="mobile"
            control={control}
            render={({ field }) => (
              <PhoneNumberField id="ds_mobile" value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.mobile && <p className="text-sm text-destructive">{errors.mobile.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ds_phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <PhoneNumberField id="ds_phone" value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ds_email">Email</Label>
          <Input
            id="ds_email" type="email" {...register('email')} className="h-11"
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ds_pan_no">PAN</Label>
          <Input id="ds_pan_no" {...register('pan_no')} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.pan_no && <p className="text-sm text-destructive">{errors.pan_no.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ds_tax_no">GSTIN <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ds_tax_no" {...register('tax_no')} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.tax_no && <p className="text-sm text-destructive">{errors.tax_no.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ds_passport_number">Passport No <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ds_passport_number" {...register('passport_number')} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.passport_number && <p className="text-sm text-destructive">{errors.passport_number.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ds_aadhaar_number">Aadhaar No <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ds_aadhaar_number" type="text" inputMode="numeric" maxLength={12} {...register('aadhaar_number')} className="h-11" />
          {errors.aadhaar_number && <p className="text-sm text-destructive">{errors.aadhaar_number.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ds_dl_number">Driving License <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="ds_dl_number" {...register('dl_number')} className="h-11" style={{ textTransform: 'uppercase' }} />
          {errors.dl_number && <p className="text-sm text-destructive">{errors.dl_number.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Address</Label>
          <Input
            {...register('address')} className="h-11" placeholder="Address line 1"
          />
          <Input {...register('address_1')} className="h-11" placeholder="Address line 2 (optional)" />
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
          <Label htmlFor="ds_pin_code">PIN Code</Label>
          <Input
            id="ds_pin_code"
            type="text"
            inputMode="numeric"
            {...register('pin_code')}
            className="h-11"
            maxLength={6}
          />
          {errors.pin_code && <p className="text-sm text-destructive">{errors.pin_code.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Nationality <span className="text-muted-foreground text-xs">(optional)</span></Label>
          {/* nationality_id is a country_id (confirmed live) — reuses the
              same Country list loaded above. */}
          <LocationSelect
            control={control}
            name="nationality_id" items={countries} idKey="country_id" labelKey="country_name"
            placeholder="Select nationality" isLoading={countriesLoading}
          />
        </div>

        <Button
          type="submit"
          disabled={updateCustomer.isPending || !isDirty}
          className="h-11 mt-1"
        >
          {updateCustomer.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>
    </div>
  );
}

export default function CustomerDetailSheet({ customer, isOpen, onClose, onAttach, isAttached }) {
  const isSuperAdmin = useSelector(selectIsSuperAdmin);
  const [activeTab, setActiveTab] = useState('profile');
  // Tracks the (isOpen, customerId) signature activeTab was last reset
  // for — null while closed. Lets a render-time comparison detect "the
  // sheet just opened, or opened for a different customer" without an
  // effect; see ProductSearchBar's identical pattern/comment for why.
  const [lastOpenKey, setLastOpenKey] = useState(null);

  // Reset to profile tab each time sheet opens for a (potentially
  // different) customer — during render, not in an effect.
  const openKey = isOpen ? (customer?.customerId ?? 'guest') : null;
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (isOpen) setActiveTab('profile');
  }

  // FIXED 2026-09-07 — Edit is only offered once this customer is actually
  // attached to the cart session, not for any record an associate merely
  // looks up in the directory. Explicit product decision: editing a
  // customer's personal details (mobile/email/address/PAN) should require
  // them to be the one actually being served right now, not something an
  // associate can do to an arbitrary browsed profile. `tabs` is derived
  // fresh every render (not a module constant) since it now depends on the
  // isAttached prop, which can change while this same sheet stays mounted
  // (e.g. tapping "Attach to Session" on the Profile tab without closing
  // the sheet first).
  // Edit also requires the operator to be an admin (2026-09-28, explicit
  // direction) — everyone else can create a customer but not edit an
  // existing one. Enforced server-side too (see api/[...path]/route.js's
  // ADMIN_ONLY_PATHS) — this is just the matching UI gate.
  const canEdit = isAttached && isSuperAdmin;
  const tabs = canEdit ? ['profile', 'edit'] : ['profile'];

  // Defensive: if isAttached flips false while Edit is the active tab
  // (attach state changing out from under an open sheet is an edge case,
  // not the normal path, but the tab must not stay selected once it's no
  // longer offered) — same "adjust during render" idiom as the reset above.
  if (activeTab === 'edit' && !canEdit) {
    setActiveTab('profile');
  }

  if (!customer) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={customer.customerName || 'Customer'}>

      {/* Tab bar — ADDED 2026-09-08: only shown once there's actually more
          than one tab to switch between. Before Edit was gated on
          isAttached (2026-09-07), Profile was always shown alongside it —
          now an unattached lookup has exactly one tab ("Profile"), and a
          tab control with a single, permanently-selected option switches
          nothing; it just took up space above the same data it was
          wrapping. Once attached, Edit reappears and the tab bar comes
          back with it.
          pb-3 removed 2026-08-24: that padded INSIDE the tab track's own
          bg-muted box (stretching its background taller), which isn't the
          same as space AFTER it — the content below still started right at
          the track's true bottom edge and read as stuck to it. Spacing now
          lives on the content wrapper's own margin-top instead, so it's
          real breathing room between the track and the data below, not
          padding hidden inside the track. */}
      {tabs.length > 1 && (
        <PillTabs
          tabs={tabs}
          value={activeTab}
          onChange={setActiveTab}
          getKey={(t) => t}
          getLabel={(t) => TAB_LABELS[t]}
          className="-mx-1 px-1"
        />
      )}

      <div className="mt-4">
        {activeTab === 'profile' && (
          <ProfileTab
            customer={customer}
            onAttach={onAttach}
            isAttached={isAttached}
            onClose={onClose}
          />
        )}
        {activeTab === 'edit' && canEdit && (
          <EditTab customer={customer} />
        )}
      </div>

    </BottomSheet>
  );
}