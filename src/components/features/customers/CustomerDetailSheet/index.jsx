'use client';

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
function ProfileTab({ customer, onAttach, isAttached, onClose }) {
  const { customerName, customerMobile, customerPhone, customerEmail, customerAddress, customerPan, taxNo, raw } = customer;
  const partyCode = raw?.party_code && raw.party_code !== 'NA' ? raw.party_code : null;
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
        {isAttached ? 'Already assigned to session' : 'Assign to Session'}
      </Button>
      {isAttached && (
        <>
          <Button asChild type="button" variant="outline" className="h-11 w-full gap-2">
            <Link href={`/customers/${customer.customerId}${nameParam ? `?${nameParam}` : ''}`} onClick={onClose}>
              <UserCircle size={16} />
              View Full Profile
            </Link>
          </Button>
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

function EditTab({ customer }) {
  const { customer: fullCustomer, isLoading: loadingFull } = useRetrieveCustomer(customer.customerId);
  const updateCustomer = useUpdateCustomer();

  const raw = fullCustomer?.raw ?? customer.raw;

  const {
    register, handleSubmit, control, watch, setValue, reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(updateCustomerSchema),
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
    // Don't fall back to the old value on blank — react-hook-form hands back
    // the full current form state here, so a falsy email/address can mean
    // "the user intentionally cleared this," not "nothing changed." Falling
    // back silently undid that clear.
    await updateCustomer.mutateAsync({
      partyId: customer.customerId,
      originalRaw: raw,
      formChanges,
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
  const [lastOpenKey, setLastOpenKey] = useState(null);
  const openKey = isOpen ? (customer?.customerId ?? 'guest') : null;
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (isOpen) setActiveTab('profile');
  }
  const canEdit = isAttached && isSuperAdmin;
  const tabs = canEdit ? ['profile', 'edit'] : ['profile'];
  if (activeTab === 'edit' && !canEdit) {
    setActiveTab('profile');
  }

  if (!customer) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={customer.customerName || 'Customer'}>
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