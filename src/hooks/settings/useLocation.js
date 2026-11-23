import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getCountries, getStates, getCities } from '@/services/locationService';
import { getCompany } from '@/services/branchTransferService';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
import STORE_DEFAULT_CITY from '@/constants/storeDefaultCity';

export function useCountries({ enabled = true } = {}) {
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const query = useQuery({
    queryKey: QUERY_KEYS.LOCATION.COUNTRIES(),
    queryFn:  async () => {
      const data = await getCountries();
      return data?.Entities ?? [];
    },
    enabled:   enabled && isAuthenticated,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    retry:     1,
  });

  return {
    countries:  query.data ?? [],
    isLoading:  query.isLoading,
    isError:    query.isError,
  };
}

/** India's country_id from the OrnaVerse country list (the default country on every form), or null until loaded. */
export function useIndiaCountryId() {
  const { countries } = useCountries();
  return countries.find((c) => String(c.country_name ?? '').trim().toLowerCase() === 'india')?.country_id ?? null;
}

async function storeAreaCityId(company) {
  const name = STORE_DEFAULT_CITY[company?.company_code];
  if (!name || !company.state_id) return null;
  const cities = (await getCities({ state_id: company.state_id }))?.Entities ?? [];
  return cities.find((c) => String(c.city_name ?? '').trim().toLowerCase() === name.toLowerCase())?.city_id ?? null;
}

/**
 * Default address location for new customers: the logged-in store's own country / state / city from its
 * OrnaVerse company record (city refined to the store's area where one is configured), falling back to India.
 * Null until known.
 */
export function useStoreLocation() {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const storeId = useSelector(selectActiveStoreId);
  const indiaId = useIndiaCountryId();
  const query = useQuery({
    queryKey: QUERY_KEYS.LOCATION.STORE(storeId),
    queryFn:  async () => {
      const company = await getCompany(storeId);
      const areaCityId = await storeAreaCityId(company).catch(() => null);
      return {
        country_id: company?.country_id ?? null,
        state_id:   company?.state_id ?? null,
        city_id:    areaCityId ?? company?.city_id ?? null,
      };
    },
    enabled:   isAuthenticated && !!storeId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    retry:     1,
  });
  if (query.data?.country_id) return query.data;
  if (query.isPending && storeId) return null;
  return indiaId ? { country_id: indiaId, state_id: null, city_id: null } : null;
}

export function useStates(countryId, { enabled = true } = {}) {
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const query = useQuery({
    queryKey: QUERY_KEYS.LOCATION.STATES(countryId),
    queryFn:  async () => {
      const data = await getStates({ country_id: countryId });
      return data?.Entities ?? [];
    },
    enabled:   enabled && isAuthenticated && !!countryId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    retry:     1,
  });

  return {
    states:    query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}

export function useCities(stateId, { enabled = true } = {}) {
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const query = useQuery({
    queryKey: QUERY_KEYS.LOCATION.CITIES(stateId),
    queryFn:  async () => {
      const data = await getCities({ state_id: stateId });
      return data?.Entities ?? [];
    },
    enabled:   enabled && isAuthenticated && !!stateId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    retry:     1,
  });

  return {
    cities:    query.data ?? [],
    isLoading: query.isLoading,
    isError:   query.isError,
  };
}