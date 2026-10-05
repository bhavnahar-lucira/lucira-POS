import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getExchangeRate } from '@/services/settingsService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useExchangeRate(currencyId = APP_CONFIG.CURRENCY.INR_ID) {
  const companyId = useSelector(selectActiveStoreId);

  const query = useQuery({
    queryKey: QUERY_KEYS.EXCHANGE_RATE.GET(currencyId, companyId),
    queryFn: async () => {
      const response = await getExchangeRate({ currency_id: currencyId, company_id: companyId });
      return response?.Entity?.exchange_rate ?? 1;
    },
    enabled:   !!companyId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  return {
    exchangeRate: query.data ?? 1,
    isLoading:    query.isLoading,
  };
}
