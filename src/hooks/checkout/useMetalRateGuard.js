import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getConfigValue, checkMetalRateToday } from '@/services/settingsService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { todayDateString } from '@/lib/dateUtils';

// OrnaVerse's sales form runs CheckMetalRateForToday on open only when config 1059 or 1060 is on
// (1012 decides use_karat_rate), and closes the form if today's rate is 0.
const CHECK_CONFIGS = [1059, 1060];
const USE_KARAT_RATE_CONFIG = 1012;
const CONFIG_STALE_MS = 30 * 60 * 1000;

const isTrue = (value) => String(value).toLowerCase() === 'true';

function useConfigFlag(companyId, code, enabled = true) {
  return useQuery({
    queryKey: ['ornaverse-config', companyId, code],
    queryFn: () => getConfigValue(code),
    enabled: enabled && !!companyId,
    staleTime: CONFIG_STALE_MS,
    gcTime: CONFIG_STALE_MS,
    retry: false,
  });
}

/** { rateMissing, message } — billing is blocked, as in OrnaVerse, when today's gold rate isn't set. */
export function useMetalRateGuard() {
  const companyId = useSelector(selectActiveStoreId);
  const first = useConfigFlag(companyId, CHECK_CONFIGS[0]);
  const second = useConfigFlag(companyId, CHECK_CONFIGS[1]);
  const checkOn = isTrue(first.data) || isTrue(second.data);
  const karat = useConfigFlag(companyId, USE_KARAT_RATE_CONFIG, checkOn);

  const today = todayDateString();
  const check = useQuery({
    queryKey: ['metal-rate-check', companyId, today, karat.data ?? null],
    queryFn: () => checkMetalRateToday({ date: today, useKaratRate: isTrue(karat.data) }),
    enabled: checkOn && karat.isFetched,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const rateMissing = checkOn && check.isSuccess && Number(check.data?.rate) === 0;
  return {
    rateMissing,
    message: rateMissing ? `Gold Rate not defined for Today ${new Date(`${today}T00:00:00`).toDateString()}` : null,
  };
}
