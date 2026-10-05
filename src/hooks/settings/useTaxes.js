import { useQuery } from '@tanstack/react-query';
import { getTaxes } from '@/services/settingsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useTaxes(companyId) {
  const query = useQuery({
    queryKey: QUERY_KEYS.SETTINGS.TAXES(companyId),
    queryFn:  () => getTaxes({ company_id: companyId }),
    enabled:  !!companyId,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    retry: false,
  });

  return {
    taxes:    query.data?.Entities ?? [],
    notConfigured: query.isError && /tax template/i.test(query.error?.serverMessage ?? ''),
    isLoading: query.isLoading,
    isError:   query.isError,
    refetch:   query.refetch,
  };
}
