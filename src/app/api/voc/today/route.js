import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { hasResponseToday } from '@/lib/mongo/vocResponses';
import { positiveInt, purchasedToday } from '@/lib/voc/server';

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.companyId) return Response.json({ error: 'Switch to a store before taking feedback.' }, { status: 403 });

  const partyId = positiveInt(new URL(request.url).searchParams.get('partyId'));
  if (!partyId) return Response.json({ error: 'Invalid partyId' }, { status: 400 });

  try {
    const [alreadyGiven, purchased] = await Promise.all([
      hasResponseToday(session.env, session.companyId, partyId),
      purchasedToday(session, partyId).catch((err) => {
        console.error('[api/voc/today] purchase lookup', partyId, err?.message);
        return null;
      }),
    ]);
    return Response.json({ alreadyGiven, purchased });
  } catch (err) {
    console.error('[api/voc/today] GET', err);
    return Response.json({ error: "Failed to check today's feedback" }, { status: 500 });
  }
}
