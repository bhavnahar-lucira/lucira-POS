import { useQuery } from '@tanstack/react-query';
import { getReasonCodes } from '@/services/settingsService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useReasonCodes() {
  const query = useQuery({
    queryKey: QUERY_KEYS.SETTINGS.REASON_CODES(),
    queryFn:  getReasonCodes,
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
    retry: false,
  });

  return {
    reasonCodes: query.data?.Entities ?? [],
    isLoading:   query.isLoading,
    isError:     query.isError,
    refetch:     query.refetch,
  };
}
