// src/app/api/frejun/agents/route.js
// Per-agent call totals for ONE store, built from its call logs (FreJun's own analytics only reports per login
// account, and store agents share their store's account — they're told apart by call tags).
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { scanCalls } from '@/lib/frejun/callScan';
import { getStoreByKey } from '@/lib/frejun/storeMapping';
import { getFrejunScope, filterCallsToScope } from '@/lib/frejun/access';
import { resolveAllAgents, callStatusTone, isIncomingCall } from '@/lib/frejun/agentInfo';

export const dynamic = 'force-dynamic';

function aggregate(calls, storeLabel) {
  const byAgent = new Map();
  for (const call of calls) {
    for (const info of resolveAllAgents(call)) {
      const untagged = !info.tagId;
      const key = untagged ? '__untagged__' : (info.fullTag || info.agentName);
      const row = byAgent.get(key) ?? {
        key,
        name: untagged ? `${storeLabel} line (no agent tag)` : info.agentName,
        untagged,
        total: 0, answered: 0, unanswered: 0, minutes: 0, incoming: 0, outgoing: 0, lastCallAt: null,
      };
      row.total += 1;
      const tone = callStatusTone(call.status);
      if (tone === 'done') row.answered += 1;
      else if (tone === 'error') row.unanswered += 1;
      row.minutes += Number(call.call_duration) || 0;
      if (isIncomingCall(call.call_type)) row.incoming += 1; else row.outgoing += 1;
      if (call.call_start_time && (!row.lastCallAt || call.call_start_time > row.lastCallAt)) row.lastCallAt = call.call_start_time;
      byAgent.set(key, row);
    }
  }
  return [...byAgent.values()]
    .map((r) => ({ ...r, minutes: Math.round(r.minutes * 10) / 10 }))
    .sort((a, b) => (a.untagged - b.untagged) || (b.total - a.total));
}

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStart = searchParams.get('dateStart') || '';
  const dateEnd = searchParams.get('dateEnd') || '';
  let store = getStoreByKey(searchParams.get('store') || '');

  try {
    const scope = await getFrejunScope(session);
    if (!scope.isAdmin && !scope.stores.some((s) => s.key === store?.key)) store = scope.stores[0] ?? null;
    if (!store) return Response.json({ ok: false, error: 'Choose a store to see its agents.' }, { status: 400 });

    const { calls, totalCalls, truncated } = await scanCalls({
      userEmail: store.email, dateStart, dateEnd, refresh: searchParams.get('refresh') === '1',
    });
    const scoped = filterCallsToScope(scope, calls);
    const data = {
      store: { key: store.key, label: store.label },
      agents: aggregate(scoped, store.label),
      totals: scoped.reduce((t, c) => {
        const tone = callStatusTone(c.status);
        return {
          total: t.total + 1,
          answered: t.answered + (tone === 'done' ? 1 : 0),
          unanswered: t.unanswered + (tone === 'error' ? 1 : 0),
          minutes: t.minutes + (Number(c.call_duration) || 0),
        };
      }, { total: 0, answered: 0, unanswered: 0, minutes: 0 }),
      callsCounted: scoped.length,
      totalCalls,
      truncated,
    };
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error('[API /api/frejun/agents] Error:', err);
    return Response.json({ ok: false, error: err.message || 'Failed to build the agent overview' }, { status: 500 });
  }
}
