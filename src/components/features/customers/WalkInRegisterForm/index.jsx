'use client';

// Real WalkIn/Register form — a CRM lead (customer_id), not a billing
// customer. Deliberately NOT a variant of NewCustomerForm: the two shapes
// only overlap on name + mobile (see crmService.js's header for the real
// field list) — this form is lead-qualification detail (source/interest/
// budget/notes), not KYC.

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import LocationSelect from '@/components/shared/LocationSelect';
import PhoneNumberField from '@/components/shared/PhoneNumberField';
import { walkInRegisterSchema } from '@/validators/walkInRegisterSchema';
import { storedValueToPhone } from '@/lib/normalizers/customer';
import { useWalkInRegister } from '@/hooks/customer/useWalkInRegister';
import { useSources } from '@/hooks/customer/useSources';
import { useCategories } from '@/hooks/catalog/useCategoryFilters';
import { useCountries, useStates, useCities } from '@/hooks/settings/useLocation';
import { todayDateString } from '@/lib/dateUtils';

// Same enums NewCustomerForm already uses for a real customer — OrnaVerse's
// own WalkIn/Register form uses the identical gender/marital_status values.
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
      source_id: null, interest: [], budget: null, notes: '',
    },
  });

  const countryId = watch('country_id');
  const stateId   = watch('state_id');
  const interest  = watch('interest');

  useEffect(() => { setValue('state_id', null); setValue('city_id', null); }, [countryId, setValue]);
  useEffect(() => { setValue('city_id', null); }, [stateId, setValue]);

  const { countries, isLoading: countriesLoading } = useCountries();
  const { states,    isLoading: statesLoading }    = useStates(countryId);
  const { cities,    isLoading: citiesLoading }    = useCities(stateId);
  const { sources,   isLoading: sourcesLoading }   = useSources();
  const { data: categories = [] } = useCategories();

  const registerWalkIn = useWalkInRegister();

  const toggleInterest = (typeId) => {
    setValue('interest', interest.includes(typeId)
      ? interest.filter((id) => id !== typeId)
      : [...interest, typeId]);
  };

  const onSubmit = async (values) => {
    const { mobile, phone, ...rest } = values;
    try {
      await registerWalkIn.mutateAsync({
        ...rest,
        mobile: mobile.startsWith('+91') ? mobile.slice(3) : mobile,
        phone:  phone ? (phone.startsWith('+91') ? phone.slice(3) : phone) : undefined,
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
            <PhoneNumberField id="wi_mobile" value={field.value} onChange={field.onChange} placeholder="Mobile number" />
          )}
        />
        {errors.mobile && <p className="text-sm text-destructive">{errors.mobile.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_first_name">First name <span className="text-destructive">*</span></Label>
        <Input id="wi_first_name" {...register('first_name')} className="h-11" />
        {errors.first_name && <p className="text-sm text-destructive">{errors.first_name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_last_name">Last name <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input id="wi_last_name" {...register('last_name')} className="h-11" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
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
        <Label htmlFor="wi_email">Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input id="wi_email" type="email" {...register('email')} className="h-11" />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
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
        <Label htmlFor="wi_birth_date">Date of birth <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input id="wi_birth_date" type="date" max={todayDateString()} {...register('birth_date')} className="h-11" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_anniversary">Anniversary <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input id="wi_anniversary" type="date" max={todayDateString()} {...register('anniversary')} className="h-11" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Country <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <LocationSelect control={control} name="country_id" items={countries} idKey="country_id" labelKey="country_name" placeholder="Select country" isLoading={countriesLoading} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>State <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <LocationSelect control={control} name="state_id" items={states} idKey="state_id" labelKey="state_name" placeholder="Select state" disabled={!countryId} disabledPlaceholder="Select country first" isLoading={statesLoading} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>City <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <LocationSelect control={control} name="city_id" items={cities} idKey="city_id" labelKey="city_name" placeholder="Select city" disabled={!stateId} disabledPlaceholder="Select state first" isLoading={citiesLoading} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_pin_code">PIN Code <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input id="wi_pin_code" type="text" inputMode="numeric" maxLength={6} {...register('pin_code')} className="h-11" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_address">Address <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input id="wi_address" {...register('address')} className="h-11" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Source <span className="text-muted-foreground text-xs">(optional)</span></Label>
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
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Interest <span className="text-muted-foreground text-xs">(optional — which categories they&apos;re browsing)</span></Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const active = interest.includes(c.type_id);
            return (
              <button
                key={c.type_id}
                type="button"
                onClick={() => toggleInterest(c.type_id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-accent border-accent text-white' : 'bg-card border-border text-muted-foreground'
                }`}
              >
                {c.type_name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_budget">Budget <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Input
          id="wi_budget" type="number" inputMode="numeric" className="h-11"
          {...register('budget', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wi_notes">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
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
    </form>
  );
}
