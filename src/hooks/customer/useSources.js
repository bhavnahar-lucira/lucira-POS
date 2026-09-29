// Lookup values for WalkIn/Register's source_id — Services/CRM/Sources/List.
import { useQuery } from '@tanstack/react-query';
import { getSources } from '@/services/crmService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';

export function useSources() {
  const query = useQuery({
    queryKey: QUERY_KEYS.CRM.SOURCES(),
    queryFn: async () => {
      const data = await getSources();
      return data?.Entities ?? [];
    },
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  return { sources: query.data ?? [], isLoading: query.isLoading };
}
