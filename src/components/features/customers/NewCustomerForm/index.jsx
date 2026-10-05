'use client';

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
import { customerSchema } from '@/validators/customerSchema';
import { storedValueToPhone } from '@/lib/normalizers/customer';
import { useCreateCustomer } from '@/hooks/customer/useCreateCustomer';
import { useCountries, useStates, useCities } from '@/hooks/settings/useLocation';
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

export default function NewCustomerForm({ defaultMobile = '', defaultName = '', onCreated }) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      party_name:     defaultName,
      mobile:         storedValueToPhone(defaultMobile),
      phone:          '',
      email:          '',
      pan_no:         '',
      tax_no:         '',
      passport_number: '',
      aadhaar_number:  '',
      dl_number:       '',
      address:        '',
      address_1:      '',
      country_id:     null,
      state_id:       null,
      city_id:        null,
      nationality_id: null,
      pin_code:       '',
      birth_date:     '',
      anniversary:    '',
      gender:         null,
      marital_status: null,
    },
  });

  const countryId = watch('country_id');
  const stateId   = watch('state_id');

  useEffect(() => {
    setValue('state_id', null);
    setValue('city_id', null);
  }, [countryId, setValue]);

  useEffect(() => {
    setValue('city_id', null);
  }, [stateId, setValue]);

  const { countries, isLoading: countriesLoading } = useCountries();
  const { states,    isLoading: statesLoading }    = useStates(countryId);
  const { cities,    isLoading: citiesLoading }    = useCities(stateId);

  const createCustomer = useCreateCustomer();

  const onSubmit = async (values) => {
    try {
      // mutateAsync now returns { customerId, customerName, customerMobile, _existing }
      const result = await createCustomer.mutateAsync(values);
      onCreated?.({
        customerId:     result.customerId,
        customerName:   result.customerName,
        customerMobile: result.customerMobile,
      });
    } catch {
      // Error toast handled by useCreateCustomer
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="party_name">
          Full name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="party_name"
          {...register('party_name')}
          className="h-11"
          placeholder="Customer full name"
        />
        {errors.party_name && (
          <p className="text-sm text-destructive">{errors.party_name.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mobile">
          Mobile number <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="mobile"
          control={control}
          render={({ field }) => (
            <PhoneNumberField id="mobile" value={field.value} onChange={field.onChange} placeholder="Mobile number" />
          )}
        />
        {errors.mobile && (
          <p className="text-sm text-destructive">{errors.mobile.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">
          Phone <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <PhoneNumberField id="phone" value={field.value} onChange={field.onChange} placeholder="Phone number" />
          )}
        />
        {errors.phone && (
          <p className="text-sm text-destructive">{errors.phone.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">
          Email <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="email"
          type="email"
          {...register('email')}
          className="h-11"
          placeholder="customer@email.com"
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pan_no">
          PAN <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="pan_no"
          {...register('pan_no')}
          className="h-11"
          placeholder="ABCDE1234F"
          style={{ textTransform: 'uppercase' }}
        />
        {errors.pan_no && (
          <p className="text-sm text-destructive">{errors.pan_no.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tax_no">
          GSTIN <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="tax_no"
          {...register('tax_no')}
          className="h-11"
          placeholder="15-character GSTIN"
          style={{ textTransform: 'uppercase' }}
        />
        {errors.tax_no && (
          <p className="text-sm text-destructive">{errors.tax_no.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="passport_number">
          Passport No <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="passport_number"
          {...register('passport_number')}
          className="h-11"
          style={{ textTransform: 'uppercase' }}
        />
        {errors.passport_number && (
          <p className="text-sm text-destructive">{errors.passport_number.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="aadhaar_number">
          Aadhaar No <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="aadhaar_number"
          type="text"
          inputMode="numeric"
          {...register('aadhaar_number')}
          className="h-11"
          placeholder="12-digit Aadhaar number"
          maxLength={12}
        />
        {errors.aadhaar_number && (
          <p className="text-sm text-destructive">{errors.aadhaar_number.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dl_number">
          Driving License <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="dl_number"
          {...register('dl_number')}
          className="h-11"
          style={{ textTransform: 'uppercase' }}
        />
        {errors.dl_number && (
          <p className="text-sm text-destructive">{errors.dl_number.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="birth_date">
          Date of birth <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="birth_date"
          type="date"
          max={todayDateString()}
          {...register('birth_date')}
          className="h-11"
        />
        {errors.birth_date && (
          <p className="text-sm text-destructive">{errors.birth_date.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="anniversary">
          Anniversary <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="anniversary"
          type="date"
          max={todayDateString()}
          {...register('anniversary')}
          className="h-11"
        />
        {errors.anniversary && (
          <p className="text-sm text-destructive">{errors.anniversary.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>
          Gender <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Controller
          name="gender"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value != null ? String(field.value) : ''}
              onValueChange={(value) => field.onChange(Number(value))}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((g) => (
                  <SelectItem key={g.value} value={String(g.value)}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>
          Marital status <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Controller
          name="marital_status"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value != null ? String(field.value) : ''}
              onValueChange={(value) => field.onChange(Number(value))}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Select marital status" />
              </SelectTrigger>
              <SelectContent>
                {MARITAL_STATUS_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>
          Address <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          {...register('address')}
          className="h-11"
          placeholder="Address line 1"
        />
        <Input
          {...register('address_1')}
          className="h-11"
          placeholder="Address line 2 (optional)"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Country</Label>
        <LocationSelect
          control={control}
          name="country_id"
          items={countries}
          idKey="country_id"
          labelKey="country_name"
          placeholder="Select country"
          isLoading={countriesLoading}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>State</Label>
        <LocationSelect
          control={control}
          name="state_id"
          items={states}
          idKey="state_id"
          labelKey="state_name"
          placeholder="Select state"
          disabled={!countryId}
          disabledPlaceholder="Select country first"
          isLoading={statesLoading}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>City</Label>
        <LocationSelect
          control={control}
          name="city_id"
          items={cities}
          idKey="city_id"
          labelKey="city_name"
          placeholder="Select city"
          disabled={!stateId}
          disabledPlaceholder="Select state first"
          isLoading={citiesLoading}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pin_code">
          PIN Code <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="pin_code"
          type="text"
          inputMode="numeric"
          {...register('pin_code')}
          className="h-11"
          placeholder="6-digit PIN"
          maxLength={6}
        />
        {errors.pin_code && (
          <p className="text-sm text-destructive">{errors.pin_code.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>
          Nationality <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        {/* nationality_id is a country_id (confirmed live) — reuses the
            same Country list already loaded above, not a separate master. */}
        <LocationSelect
          control={control}
          name="nationality_id"
          items={countries}
          idKey="country_id"
          labelKey="country_name"
          placeholder="Select nationality"
          isLoading={countriesLoading}
        />
      </div>

      <Button type="submit" disabled={createCustomer.isPending} className="h-11 mt-1">
        {createCustomer.isPending ? 'Checking & creating…' : 'Create Customer'}
      </Button>
    </form>
  );
}