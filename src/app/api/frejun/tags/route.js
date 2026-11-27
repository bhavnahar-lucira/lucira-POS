import { after } from 'next/server';
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getFrejunScope } from '@/lib/frejun/access';
import { listAgentTags, discoverAgentTagsIfDue } from '@/lib/mongo/frejunAgentTags';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });

  try {
    const scope = await getFrejunScope(session);
    const storeKeys = scope.isAdmin ? null : scope.stores.map((s) => s.key);
    if (storeKeys && !storeKeys.length) return Response.json({ ok: true, data: [] });

    let tags = await listAgentTags(storeKeys);
    if (!tags.length) {
      await discoverAgentTagsIfDue();
      tags = await listAgentTags(storeKeys);
    } else {
      after(discoverAgentTagsIfDue);
    }
    return Response.json({ ok: true, data: tags });
  } catch (err) {
    console.error('[API /api/frejun/tags] Error:', err);
    return Response.json({ ok: false, error: err.message || 'Failed to load agent tags' }, { status: 500 });
  }
}
