import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getUserStoresCached } from '@/lib/reports/serverAccess';
import { vocSkipSchema } from '@/validators/vocSchema';
import { filterFromParams } from '@/lib/voc/server';
import { listSkips, recordSkip } from '@/lib/mongo/vocResponses';

/** Customers who skipped the feedback, for the store and dates of the feedback list. */
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { filter, error, status } = filterFromParams(session, new URL(request.url).searchParams);
  if (error) return Response.json({ error }, { status });

  try {
    return Response.json(await listSkips(filter));
  } catch (err) {
    console.error('[api/voc/skips] GET', err);
    return Response.json({ error: 'Failed to load skipped feedback' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.companyId) return Response.json({ error: 'Switch to a store first.' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = vocSkipSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });

  try {
    const store = (await getUserStoresCached(session)).find((s) => s.company_id === session.companyId);
    if (!store) return Response.json({ error: 'Switch to a store first.' }, { status: 403 });
    await recordSkip({
      env: session.env,
      store: { id: store.company_id, name: store.mailing_name ?? null, code: store.company_code ?? null },
      ...parsed.data,
      user: session.username,
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[api/voc/skips] POST', err);
    return Response.json({ error: 'Failed to record the skip' }, { status: 500 });
  }
}
