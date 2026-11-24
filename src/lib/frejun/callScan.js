// SERVER-ONLY. Reads every call for one FreJun user (a store line) in a date range — FreJun pages at most 100
// calls and can't filter by agent tag, so per-agent views scan the range once and work from that.
import { getFrejunCalls } from './frejunClient';

const PAGE_SIZE = 100;
const MAX_PAGES = 40;
const CONCURRENCY = 4;
const CACHE_TTL_MS = 25 * 1000;
const cache = new Map();

export async function scanCalls({ userEmail, dateStart, dateEnd, candidateNumber = '', refresh = false }) {
  const key = `${userEmail}|${dateStart}|${dateEnd}|${candidateNumber}`;
  const hit = cache.get(key);
  if (!refresh && hit && hit.expiresAt > Date.now()) return hit.value;

  const query = { pageSize: PAGE_SIZE, userEmail, dateStart, dateEnd, candidateNumber };
  const first = await getFrejunCalls({ ...query, page: 1 });
  const totalCalls = first?.count ?? 0;
  const pages = Math.min(Math.ceil(totalCalls / PAGE_SIZE), MAX_PAGES);
  const byPage = [first?.results ?? []];

  let next = 2;
  const worker = async () => {
    while (next <= pages) {
      const page = next++;
      const data = await getFrejunCalls({ ...query, page });
      byPage[page - 1] = data?.results ?? [];
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const value = { calls: byPage.flat(), totalCalls, truncated: totalCalls > pages * PAGE_SIZE };
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return value;
}
