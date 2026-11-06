import { useQuery } from '@tanstack/react-query';
import { getConfigValue, getUserData } from '@/services/settingsService';

const MANUAL_RATES_CONFIG = 1056;
const MANUAL_RATES_PERMISSION = 'Administration:Transaction:AllowManualRates';

/** Same rule as OrnaVerse's canEditManualRates: config 1056 on, and the operator is admin or holds AllowManualRates. */
export function useCanEditManualRates() {
  const query = useQuery({
    queryKey: ['transactions', 'can-edit-manual-rates'],
    queryFn: async () => {
      const [enabled, user] = await Promise.all([getConfigValue(MANUAL_RATES_CONFIG), getUserData()]);
      if (String(enabled).toLowerCase() !== 'true') return false;
      return !!(user?.is_admin || user?.permissions?.[MANUAL_RATES_PERMISSION]);
    },
    staleTime: 0,
    gcTime: 0,
  });
  return query.data === true;
}
