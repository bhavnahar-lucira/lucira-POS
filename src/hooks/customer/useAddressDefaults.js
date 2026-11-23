import { useEffect, useRef } from 'react';
import { useStoreLocation } from '@/hooks/settings/useLocation';

/**
 * Country → state → city for a new-customer form (react-hook-form): starts from the logged-in store's
 * location, and clears the dependent fields only when staff switch a filled value to another one.
 */
export function useAddressDefaults({ watch, setValue, getValues }) {
  'use no memo'; // react-hook-form's watch() must re-run every render; the compiler would cache it.
  const countryId = watch('country_id');
  const stateId = watch('state_id');

  const previous = useRef({ countryId, stateId });
  useEffect(() => {
    const prev = previous.current;
    if (prev.countryId != null && prev.countryId !== countryId) {
      setValue('state_id', null);
      setValue('city_id', null);
    } else if (prev.stateId != null && prev.stateId !== stateId) {
      setValue('city_id', null);
    }
    previous.current = { countryId, stateId };
  }, [countryId, stateId, setValue]);

  const storeLocation = useStoreLocation();
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !storeLocation) return;
    prefilled.current = true;
    if (getValues('country_id') != null) return;
    setValue('country_id', storeLocation.country_id);
    setValue('state_id', storeLocation.state_id);
    setValue('city_id', storeLocation.city_id);
  }, [storeLocation, getValues, setValue]);

  return { countryId, stateId };
}
