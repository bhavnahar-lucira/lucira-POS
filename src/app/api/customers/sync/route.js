import { customerProfileSchema } from '@/validators/customerProfileSchema';
import { upsertCustomerProfile } from '@/lib/mongo/customerProfile';
import { UPSTREAM } from '@/lib/ornaverse/upstream';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

const requestSchema = customerProfileSchema.pick({ party_id: true });

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { party_id } = parsed.data;

  let retrieveRes;
  try {
    const headers = { 'Content-Type': 'application/json', Cookie: session.cookie };
    if (session.csrf) headers['X-CSRF-TOKEN'] = session.csrf;
    retrieveRes = await fetch(`${UPSTREAM}/Services/POS/Customer/Retrieve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ EntityId: party_id }),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[api/customers/sync] upstream fetch failed', err);
    return Response.json({ error: 'Sync failed' }, { status: 502 });
  }

  if (!retrieveRes.ok) {
    const status = retrieveRes.status === 401 ? 401 : 502;
    return Response.json({ error: 'Could not verify customer with OrnaVerse' }, { status });
  }

  let entity;
  try {
    entity = (await retrieveRes.json())?.Entity;
  } catch {
    return Response.json({ error: 'Sync failed' }, { status: 502 });
  }
  if (!entity) {
    return Response.json({ error: 'Customer not found' }, { status: 404 });
  }

  try {
    await upsertCustomerProfile({ party_id, profile: entity });
    return Response.json({ ok: true, party_id });
  } catch (err) {
    console.error('[api/customers/sync]', err);
    return Response.json({ error: 'Sync failed' }, { status: 500 });
  }
}
