import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useLoyaltySettings, pointsBalanceQuery, pointsBalanceKey, pointsFromPreview,
} from '@/hooks/customers/useLuciraPoints';

const WORKERS = 3;
const FLUSH_MS = 400;

/**
 * Live Lucira points for a list of buyers at a store, for sorting by coins. Balances are shared with the
 * per-card pills through the React Query cache (fresh for 10 min), so revisits and the dashboard reuse them.
 * Biggest spenders are fetched first so the top of a coins-sorted list settles early.
 * Buyers whose balance couldn't be loaded are left out of the map (shown as "—", sorted last), never as 0.
 */
export function useBuyersCoins({ buyers = [], companyId, enabled = true, refreshKey = 0 }) {
  const queryClient = useQueryClient();
  const { isLoyaltyEnabled, itemGroup, isLoading: isSettingsLoading } = useLoyaltySettings(companyId, { enabled });
  const isReady = enabled && isLoyaltyEnabled;

  const eligible = useMemo(
    () => buyers
      .filter((b) => b._id && b.customerMobile)
      .sort((a, b) => (b.totalSpend ?? 0) - (a.totalSpend ?? 0)),
    [buyers],
  );
  const eligibleKey = useMemo(() => eligible.map((b) => `${b._id}:${b.customerMobile}`).join('|'), [eligible]);
  const runKey = `${isReady}|${companyId}|${itemGroup}|${refreshKey}|${eligibleKey}`;

  const [run, setRun] = useState({ key: null, map: new Map(), loaded: 0, done: false });

  useEffect(() => {
    if (!isReady || !eligible.length) return undefined;

    let cancelled = false;
    const map = new Map();
    let loaded = 0;
    let flushTimer = null;

    const flush = () => {
      flushTimer = null;
      if (!cancelled) setRun({ key: runKey, map: new Map(map), loaded, done: loaded >= eligible.length });
    };
    const scheduleFlush = () => {
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    };

    for (const buyer of eligible) {
      const cached = queryClient.getQueryData(pointsBalanceKey(companyId, buyer._id));
      if (cached?.success !== undefined) map.set(Number(buyer._id), pointsFromPreview(cached));
    }
    flushTimer = setTimeout(flush, 0);

    let next = 0;
    const worker = async () => {
      while (!cancelled && next < eligible.length) {
        const buyer = eligible[next++];
        const partyId = Number(buyer._id);
        try {
          const res = await queryClient.fetchQuery(
            pointsBalanceQuery({ companyId, partyId, mobile: buyer.customerMobile, itemGroup }),
          );
          map.set(partyId, pointsFromPreview(res));
        } catch {
          map.delete(partyId);
        }
        loaded++;
        scheduleFlush();
      }
    };
    Promise.all(Array.from({ length: WORKERS }, worker)).then(() => {
      if (flushTimer) clearTimeout(flushTimer);
      flush();
    });

    return () => {
      cancelled = true;
      if (flushTimer) clearTimeout(flushTimer);
    };
    // runKey captures every input the sweep depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  const isCurrent = run.key === runKey;
  const isSweeping = isReady && eligible.length > 0 && !(isCurrent && run.done);

  return {
    coinsMap: isCurrent ? run.map : EMPTY_MAP,
    isLoadingCoins: (enabled && isSettingsLoading) || isSweeping,
    progress: { loaded: isCurrent ? run.loaded : 0, total: eligible.length },
  };
}

const EMPTY_MAP = new Map();
