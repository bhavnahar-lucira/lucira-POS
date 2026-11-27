// SERVER-ONLY. Reads every call for one FreJun user (a store line) in a date range — FreJun pages at most 100
// calls and can't filter by agent tag, so per-agent views scan the range once and work from that.
import { getFrejunCalls } from './frejunClient';

const PAGE_SIZE = 100;
export const MAX_SCAN_PAGES = 60;
const CONCURRENCY = 4;
const CACHE_TTL_MS = 25 * 1000;
const cache = new Map();

async function fetchPage(query, page) {
  try {
    return await getFrejunCalls({ ...query, page });
  } catch {
    await new Promise((r) => setTimeout(r, 800));
    return getFrejunCalls({ ...query, page });
  }
}

async function runScan({ userEmail, dateStart, dateEnd, candidateNumber }) {
  const query = { pageSize: PAGE_SIZE, userEmail, dateStart, dateEnd, candidateNumber };
  const first = await fetchPage(query, 1);
  const totalCalls = first?.count ?? 0;
  const pages = Math.min(Math.ceil(totalCalls / PAGE_SIZE), MAX_SCAN_PAGES);
  const byPage = [first?.results ?? []];

  let next = 2;
  const worker = async () => {
    while (next <= pages) {
      const page = next++;
      const data = await fetchPage(query, page);
      byPage[page - 1] = data?.results ?? [];
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return { calls: byPage.flat(), totalCalls, truncated: totalCalls > pages * PAGE_SIZE };
}

export async function scanCalls({ userEmail = '', dateStart, dateEnd, candidateNumber = '', refresh = false }) {
  const key = `${userEmail}|${dateStart}|${dateEnd}|${candidateNumber}`;
  const hit = cache.get(key);
  if (!refresh && hit && (hit.pending || hit.expiresAt > Date.now())) return hit.promise;

  const promise = runScan({ userEmail, dateStart, dateEnd, candidateNumber });
  const entry = { promise, pending: true, expiresAt: 0 };
  cache.set(key, entry);
  promise.then(
    () => { entry.pending = false; entry.expiresAt = Date.now() + CACHE_TTL_MS; },
    () => { if (cache.get(key) === entry) cache.delete(key); },
  );
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return promise;
}

export const customerKey = (call) => String(call?.candidate_number || '').replace(/\D/g, '').slice(-10);

export function countUniqueCustomers(calls) {
  const seen = new Set();
  for (const c of calls) {
    const k = customerKey(c);
    if (k) seen.add(k);
  }
  return seen.size;
}
