// Overall call totals for the whole selected period (not one page): total / connected / not connected / talk time
// come from FreJun's analytics (exact for any range); unique customers need every call, so the range is scanned.
import { after } from 'next/server';
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getFrejunAnalytics } from '@/lib/frejun/frejunClient';
import { scanCalls, countUniqueCustomers, MAX_SCAN_PAGES } from '@/lib/frejun/callScan';
import { FREJUN_STORES, getStoreByKey } from '@/lib/frejun/storeMapping';
import { getFrejunScope, scopeAllowsEmail, filterCallsToScope } from '@/lib/frejun/access';
import { callStatusTone, splitAgentTag } from '@/lib/frejun/agentInfo';
import { rememberAgentTags, findAgentTagStore } from '@/lib/mongo/frejunAgentTags';

export const dynamic = 'force-dynamic';

const isStoreTag = (store, tag) => !!store && (
  store.tags?.some((t) => t.toLowerCase() === tag)
  || store.key.toLowerCase() === tag
  || store.label.toLowerCase().includes(tag)
);

function summarise(calls) {
  let connected = 0;
  let minutes = 0;
  for (const c of calls) {
    if (callStatusTone(c.status) === 'done') connected += 1;
    minutes += Number(c.call_duration) || 0;
  }
  return { total: calls.length, connected, notConnected: calls.length - connected, minutes, uniqueCustomers: countUniqueCustomers(calls) };
}

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStart = searchParams.get('dateStart') || '';
  const dateEnd = searchParams.get('dateEnd') || '';
  const storeKey = (searchParams.get('store') || '').toLowerCase().trim();
  const tag = (searchParams.get('tag') || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const search = (searchParams.get('search') || '').trim();
  const requestedEmail = (searchParams.get('userEmail') || '').trim();
  const refresh = searchParams.get('refresh') === '1';

  try {
    const scope = await getFrejunScope(session);
    if (!scope.isAdmin && scope.stores.length === 0) return Response.json({ ok: true, data: null });

    let store = storeKey && storeKey !== 'all' ? getStoreByKey(storeKey) : null;
    if (!store && tag && tag !== 'all') {
      const inferred = FREJUN_STORES.find((s) => s.match.test(splitAgentTag(tag)?.storePart ?? tag))
        || getStoreByKey(await findAgentTagStore(tag).catch(() => null));
      if (inferred && (scope.isAdmin || scope.stores.some((s) => s.key === inferred.key))) store = inferred;
    }
    if (!scope.isAdmin && !scope.stores.some((s) => s.key === store?.key)) store = scope.stores[0];

    let userEmail = requestedEmail && scopeAllowsEmail(scope, requestedEmail) ? requestedEmail : (store?.email || '');
    let candidateNumber = '';
    if (search.includes('@')) {
      if (scopeAllowsEmail(scope, search)) userEmail = search;
    } else if (search) {
      candidateNumber = search;
    }
    const agentTag = tag && tag !== 'all' && !isStoreTag(store, tag) ? tag : '';

    if (agentTag || candidateNumber) {
      const { calls, truncated } = await scanCalls({ userEmail, dateStart, dateEnd, candidateNumber, refresh });
      after(() => rememberAgentTags(calls));
      const scoped = filterCallsToScope(scope, calls).filter((c) => !agentTag
        || (Array.isArray(c.tags) && c.tags.some((t) => String(t.name || '').toLowerCase().replace(/\s+/g, ' ').includes(agentTag)))
        || c.recruiter?.toLowerCase().includes(agentTag));
      return Response.json({ ok: true, data: { ...summarise(scoped), truncated, uniqueExact: !truncated } });
    }

    const rows = await getFrejunAnalytics({ dateStart, dateEnd });
    const wanted = userEmail ? [userEmail.toLowerCase()] : (scope.isAdmin ? null : scope.stores.map((s) => s.email.toLowerCase()));
    const picked = wanted ? rows.filter((r) => wanted.includes(String(r.user).toLowerCase())) : rows;
    const total = picked.reduce((s, r) => s + (Number(r.total_calls) || 0), 0);
    const connected = picked.reduce((s, r) => s + (Number(r.answered_calls) || 0), 0);
    const minutes = picked.reduce((s, r) => s + (parseFloat(r.total_minutes) || 0), 0);

    let uniqueCustomers = null;
    let uniqueExact = false;
    if (total > 0 && Math.ceil(total / 100) <= MAX_SCAN_PAGES) {
      try {
        const { calls, truncated } = await scanCalls({ userEmail, dateStart, dateEnd, refresh });
        after(() => rememberAgentTags(calls));
        uniqueCustomers = countUniqueCustomers(filterCallsToScope(scope, calls));
        uniqueExact = !truncated;
      } catch (err) {
        console.error('[API /api/frejun/summary] unique-customer scan failed:', err);
      }
    } else if (total === 0) {
      uniqueCustomers = 0;
      uniqueExact = true;
    }

    return Response.json({
      ok: true,
      data: { total, connected, notConnected: Math.max(0, total - connected), minutes, uniqueCustomers, uniqueExact, truncated: false },
    });
  } catch (err) {
    console.error('[API /api/frejun/summary] Error:', err);
    return Response.json({ ok: false, error: err.message || 'Failed to build the call summary' }, { status: 500 });
  }
}
