import { getSessionFromRequest } from '@/lib/ornaverse/session';
import API from '@/constants/apiEndpoints';
import { getUserStoresCached, postUpstream } from '@/lib/reports/serverAccess';
import { vocCreateSchema } from '@/validators/vocSchema';
import { summarize } from '@/lib/voc/summary';
import { filterFromParams, positiveInt, toPublicResponse, withFullMobiles } from '@/lib/voc/server';
import { listResponses, countAnswers, insertResponse, DuplicateFeedbackError } from '@/lib/mongo/vocResponses';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const { filter, error, status } = filterFromParams(session, params);
  if (error) return Response.json({ error }, { status });

  const skip = Math.max(0, Math.floor(Number(params.get('skip')) || 0));
  const limit = Math.min(MAX_LIMIT, positiveInt(params.get('limit')) ?? DEFAULT_LIMIT);

  try {
    const [{ rows, total }, counts] = await Promise.all([
      listResponses(filter, { skip, limit }),
      skip === 0 ? countAnswers(filter) : null,
    ]);
    const publicRows = rows.map(toPublicResponse);
    return Response.json({
      rows: params.get('mobiles') === '1' ? await withFullMobiles(session, publicRows) : publicRows,
      total,
      nextSkip: skip + rows.length < total ? skip + rows.length : null,
      ...(counts && { summary: summarize(counts) }),
    });
  } catch (err) {
    console.error('[api/voc] GET', err);
    return Response.json({ error: 'Failed to load feedback' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.companyId) return Response.json({ error: 'Switch to a store before taking feedback.' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = vocCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid feedback' }, { status: 400 });
  }

  let store;
  try {
    store = (await getUserStoresCached(session)).find((s) => s.company_id === session.companyId);
  } catch (err) {
    console.error('[api/voc] POST store lookup', err);
    return Response.json({ error: 'OrnaVerse is not responding right now. Please try again in a moment.' }, { status: 502 });
  }
  if (!store) return Response.json({ error: 'Switch to a store before taking feedback.' }, { status: 403 });

  const customer = { ...parsed.data.customer };
  if (!customer.email || !customer.mobile) {
    try {
      const entity = (await postUpstream(session, API.CUSTOMERS.RETRIEVE, { EntityId: customer.party_id }))?.Entity;
      customer.email ||= entity?.email && entity.email !== 'NA' ? entity.email : null;
      customer.mobile ||= entity?.mobile ?? null;
    } catch (err) {
      console.error('[api/voc] POST customer lookup', customer.party_id, err?.message);
    }
  }

  try {
    const saved = await insertResponse({
      env: session.env,
      store: { id: store.company_id, name: store.mailing_name ?? null, code: store.company_code ?? null },
      ...parsed.data,
      customer,
      submittedBy: session.username,
    });
    return Response.json({ response: toPublicResponse(saved) }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateFeedbackError) return Response.json({ error: err.message }, { status: 409 });
    console.error('[api/voc] POST', err);
    return Response.json({ error: 'Failed to save feedback' }, { status: 500 });
  }
}
