import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { filterFromParams } from '@/lib/voc/server';
import { listReferrals } from '@/lib/mongo/vocResponses';

/** Referrals customers gave in their feedback, for the same filters as the feedback list. */
export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { filter, error, status } = filterFromParams(session, new URL(request.url).searchParams);
  if (error) return Response.json({ error }, { status });

  try {
    return Response.json(await listReferrals(filter));
  } catch (err) {
    console.error('[api/voc/referrals] GET', err);
    return Response.json({ error: 'Failed to load referrals' }, { status: 500 });
  }
}
