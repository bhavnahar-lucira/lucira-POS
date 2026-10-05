import { useQueries } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { getMetalRate } from '@/services/settingsService';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { QUERY_KEYS } from '@/constants/queryKeys';
import APP_CONFIG from '@/constants/appConfig';
import { todayDateString } from '@/lib/dateUtils';

// karat_id -> raw code, in on-screen order.
const KARAT_RATES = [
  { karatId: 835,  code: '09'   },
  { karatId: 85,   code: '14'   },
  { karatId: 86,   code: '18'   },
  { karatId: 87,   code: '22'   },
  { karatId: 1595, code: '916'  },
  { karatId: 88,   code: '925'  },
  { karatId: 89,   code: '95'   },
  { karatId: 1132, code: '995'  },
  { karatId: 1133, code: '999'  },
  { karatId: 0,    code: 'NA'   },
  { karatId: 1755, code: 'S999' },
];

/**
 * @param {string[]|null} [onlyCodes] — restrict to these raw codes (see
 *   KARAT_RATES above) instead of firing all 11 GetMetalRate calls. Pass
 *   null/omit for the full dashboard set; a caller that only needs a few
 *   karats (e.g. a PDP "Today's Rate" card wanting just '09'/'18'/'22'/'999')
 *   should pass those so it isn't paying for calls nothing on screen uses.
 * @returns {{
 *   rates: { code: string, rate: number|null, isLoading: boolean, isError: boolean }[],
 *   isLoading: boolean,  — true only until the FIRST rate resolves, so the
 *     strip can render progressively rather than waiting on all calls.
 *   hasAny: boolean,     — at least one rate resolved; the caller should
 *     render nothing at all otherwise rather than a row of blank cards.
 * }}
 */
export function useMetalRates(onlyCodes = null) {
  const companyId = useSelector(selectActiveStoreId);
  // Use the local-calendar-day date, not UTC, so the cache key rolls over
  // at local midnight rather than ~5:30am IST — see todayDateString().
  const dateKey = todayDateString();

  const activeKarats = onlyCodes
    ? KARAT_RATES.filter((k) => onlyCodes.includes(k.code))
    : KARAT_RATES;

  const results = useQueries({
    queries: activeKarats.map(({ karatId }) => ({
      queryKey:  QUERY_KEYS.SETTINGS.METAL_RATE(karatId, companyId, dateKey),
      queryFn:   () => getMetalRate({ karatId, companyId }),
      enabled:   !!companyId,
      staleTime: APP_CONFIG.STALE_TIME.STOCK, // rates can move intraday
      select:    (data) => (typeof data?.rate === 'number' ? data.rate : null),
    })),
  });

  const rates = activeKarats.map(({ code }, i) => ({
    code,
    rate:      results[i].data ?? null,
    isLoading: results[i].isLoading,
    isError:   results[i].isError,
  }));

  const hasAny = rates.some((r) => r.rate != null);

  return {
    rates,
    isLoading: !hasAny && results.some((r) => r.isLoading),
    hasAny,
  };
}
