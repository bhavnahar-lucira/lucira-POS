import { todayDateString } from '@/lib/dateUtils';
import APP_CONFIG from '@/constants/appConfig';

export const LIVE_REPORT_REFRESH_MS = 2 * 60 * 1000;

/** Ranges that include today keep refreshing while open, so new bills and orders show up; past ranges can't change. */
export function liveReportOptions(toDate) {
  const isLive = !!toDate && toDate >= todayDateString();
  return isLive
    ? { staleTime: 0, refetchInterval: LIVE_REPORT_REFRESH_MS, refetchOnWindowFocus: true }
    : { staleTime: APP_CONFIG.STALE_TIME.ANALYTICS, refetchOnWindowFocus: false };
}

/** First load of a range shows a loader; background refreshes keep the current numbers on screen. */
export const isFirstLoad = (query) => query.isFetching && query.data === undefined;
