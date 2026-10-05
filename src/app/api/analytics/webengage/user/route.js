import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { upsertWebEngageUser } from '@/lib/analytics/webengageServer';

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const { userId, anonymousId } = payload ?? {};
  if (!userId && !anonymousId) {
    return Response.json({ ok: false, error: 'identity_required' }, { status: 400 });
  }

  const result = await upsertWebEngageUser(payload);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
