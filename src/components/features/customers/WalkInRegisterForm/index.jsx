'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useSelector } from 'react-redux';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Loader2, UserCheck } from 'lucide-react';
import LocationSelect from '@/components/shared/LocationSelect';
import PhoneNumberField from '@/components/shared/PhoneNumberField';
import SalesPersonSelect from '@/components/features/checkout/SalesPersonSelect';
import { walkInRegisterSchema } from '@/validators/walkInRegisterSchema';
import { storedValueToPhone } from '@/lib/normalizers/customer';
import { useWalkInRegister } from '@/hooks/customer/useWalkInRegister';
import { useWalkInLookup } from '@/hooks/customer/useWalkInLookup';
import { useSources } from '@/hooks/customer/useSources';
import { useCategories } from '@/hooks/catalog/useCategoryFilters';
import { useCountries, useStates, useCities } from '@/hooks/settings/useLocation';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { todayDateString } from '@/lib/dateUtils';

const GENDER_OPTIONS = [
  { value: 1, label: 'Male' },
  { value: 2, label: 'Female' },
  { value: 3, label: 'Other' },
];
const MARITAL_STATUS_OPTIONS = [
  { value: 1, label: 'Single' },
  { value: 2, label: 'Married' },
];

export default function WalkInRegisterForm({ defaultMobile = '', onRegistered }) {
  const {
    register, handleSubmit, control, watch, setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(walkInRegisterSchema),
    defaultValues: {
      mobile: storedValueToPhone(defaultMobile),
      first_name: '', last_name: '', phone: '', email: '',
      gender: null, marital_status: null,
      birth_date: '', anniversary: '',
      country_id: null, state_id: null, city_id: null,
      pin_code: '', address: '',
      source_id: null, sales_representative_id: null, interest: [], budget: null, notes: '',
    },
  });

  const countryId = watch('country_id');
  const stateId   = watch('state_id');
  const interest  = watch('interest');

  useEffect(() => { setValue('state_id', null); setValue('city_id', null); }, [countryId, setValue]);
  useEffect(() => { setValue('city_id', null); }, [stateId, setValue]);

  const activeStoreId = useSelector(selectActiveStoreId);
  const { countries, isLoading: countriesLoading } = useCountries();
  const { states,    isLoading: statesLoading }    = useStates(countryId);
  const { cities,    isLoading: citiesLoading }    = useCities(stateId);
  const { sources,   isLoading: sourcesLoading }   = useSources();
  const { data: categories = [] } = useCategories();

  const registerWalkIn = useWalkInRegister();

  // Mirrors OrnaVerse's own Walk-In screen: "enter mobile and tab out" checks
  // for an existing CRM customer before letting the operator fill out a
  // full registration (which would otherwise create a duplicate record).
  const walkIn = useWalkInLookup();
  const [checkedMobile, setCheckedMobile] = useState(null);
  const mobileValue = watch('mobile');

  const mobileDigits = (mobileValue ?? '').startsWith('+91') ? mobileValue.slice(3) : mobileValue;
  const isCompleteMobile = /^\d{10}$/.test(mobileDigits ?? '');

  useEffect(() => {
    if (checkedMobile && mobileDigits !== checkedMobile) {
      walkIn.reset();
      setCheckedMobile(null);
    }
  }, [mobileDigits, checkedMobile]);

  const handleMobileBlur = () => {
    if (isCompleteMobile && mobileDigits !== checkedMobile) {
      setCheckedMobile(mobileDigits);
      walkIn.lookup(mobileDigits);
    }
  };

  const existingCustomer = walkIn.result?.found ? walkIn.result.customer : null;

  const toggleInterest = (typeId) => {
    setValue('interest', interest.includes(typeId)
      ? interest.filter((id) => id !== typeId)
      : [...interest, typeId]);
  };

  const onSubmit = async (values) => {
    const { mobile, phone, ...rest } = values;
    const cleaned = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    );
    try {
      await registerWalkIn.mutateAsync({
        ...cleaned,
        mobile: mobile.startsWith('+91') ? mobile.slice(3) : mobile,
        ...(phone ? { phone: phone.startsWith('+91') ? phone.slice(3) : phone } : {}),
      });
      onRegistered?.();
    } catch {
      // Error toast handled by useWalkInRegister
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_mobile">Mobile <span className="text-destructive">*</span></Label>
        <Controller
          name="mobile"
          control={control}
          render={({ field }) => (
            <PhoneNumberField
              id="wi_mobile"
              value={field.value}
              onChange={field.onChange}
              onBlur={() => { field.onBlur(); handleMobileBlur(); }}
              placeholder="Mobile number"
            />
          )}
        />
        {errors.mobile && <p className="text-sm text-destructive">{errors.mobile.message}</p>}
        {walkIn.isLoading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            Checking for an existing customer…
          </p>
        )}
        {existingCustomer && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <UserCheck size={16} className="shrink-0 mt-0.5 text-foreground/70" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {existingCustomer.name ? `${existingCustomer.name} is already registered.` : 'Already registered.'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {walkIn.result?.walkInRecorded
                  ? 'Their visit has just been recorded.'
                  : (walkIn.result?.message ?? 'A visit was already logged for them recently.')}
                {' '}No need to register again.
              </p>
            </div>
          </div>
        )}
      </div>

      {!existingCustomer && (
      <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_first_name">First name <span className="text-destructive">*</span></Label>
        <Input id="wi_first_name" {...register('first_name')} className="h-11" />
        {errors.first_name && <p className="text-sm text-destructive">{errors.first_name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_last_name">Last name <span className="text-destructive">*</span></Label>
        <Input id="wi_last_name" {...register('last_name')} className="h-11" />
        {errors.last_name && <p className="text-sm text-destructive">{errors.last_name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_phone">Phone</Label>
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <PhoneNumberField id="wi_phone" value={field.value} onChange={field.onChange} placeholder="Phone number" />
          )}
        />
        {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_email">Email</Label>
        <Input id="wi_email" type="email" {...register('email')} className="h-11" />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Gender <span className="text-destructive">*</span></Label>
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
        {errors.gender && <p className="text-sm text-destructive">{errors.gender.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Marital status</Label>
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
        <Label htmlFor="wi_birth_date">Date of birth</Label>
        <Input id="wi_birth_date" type="date" max={todayDateString()} {...register('birth_date')} className="h-11" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_anniversary">Anniversary</Label>
        <Input id="wi_anniversary" type="date" max={todayDateString()} {...register('anniversary')} className="h-11" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Country</Label>
        <LocationSelect control={control} name="country_id" items={countries} idKey="country_id" labelKey="country_name" placeholder="Select country" isLoading={countriesLoading} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>State</Label>
        <LocationSelect control={control} name="state_id" items={states} idKey="state_id" labelKey="state_name" placeholder="Select state" disabled={!countryId} disabledPlaceholder="Select country first" isLoading={statesLoading} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>City</Label>
        <LocationSelect control={control} name="city_id" items={cities} idKey="city_id" labelKey="city_name" placeholder="Select city" disabled={!stateId} disabledPlaceholder="Select state first" isLoading={citiesLoading} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_pin_code">PIN Code <span className="text-destructive">*</span></Label>
        <Input id="wi_pin_code" type="text" inputMode="numeric" maxLength={6} {...register('pin_code')} className="h-11" />
        {errors.pin_code && <p className="text-sm text-destructive">{errors.pin_code.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_address">Address</Label>
        <Input id="wi_address" {...register('address')} className="h-11" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Source <span className="text-destructive">*</span></Label>
        <Controller
          name="source_id"
          control={control}
          render={({ field }) => (
            <Select value={field.value != null ? String(field.value) : ''} onValueChange={(v) => field.onChange(Number(v))} disabled={sourcesLoading}>
              <SelectTrigger className="h-11 w-full"><SelectValue placeholder="How did they hear about us?" /></SelectTrigger>
              <SelectContent>
                {sources.map((s) => {
                  const id = s.source_id ?? s.id;
                  const label = s.source_name ?? s.name ?? `Source ${id}`;
                  return <SelectItem key={id} value={String(id)}>{label}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          )}
        />
        {errors.source_id && <p className="text-sm text-destructive">{errors.source_id.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Sales representative</Label>
        <Controller
          name="sales_representative_id"
          control={control}
          render={({ field }) => (
            <SalesPersonSelect companyId={activeStoreId} value={field.value} onChange={field.onChange} />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Interest</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <span className={interest.length ? '' : 'text-muted-foreground'}>
                {interest.length
                  ? categories.filter((c) => interest.includes(c.type_id)).map((c) => c.type_name).join(', ')
                  : 'Select interests'}
              </span>
              <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-64">
            {categories.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.type_id}
                checked={interest.includes(c.type_id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggleInterest(c.type_id)}
              >
                {c.type_name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_budget">Budget</Label>
        <Input
          id="wi_budget" type="number" inputMode="numeric" className="h-11"
          {...register('budget', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_notes">Notes</Label>
        <textarea
          id="wi_notes"
          {...register('notes')}
          rows={3}
          className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <Button type="submit" disabled={registerWalkIn.isPending} className="h-11 mt-1">
        {registerWalkIn.isPending ? 'Registering…' : 'Register Walk-in'}
      </Button>
      </>
      )}
    </form>
  );
}
