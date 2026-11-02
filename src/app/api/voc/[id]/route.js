import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { vocUpdateSchema } from '@/validators/vocSchema';
import { getResponse, updateResponse, deleteResponse } from '@/lib/mongo/vocResponses';
import { toPublicResponse } from '@/lib/voc/server';

async function superAdminSession(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return { error: Response.json({ error: 'Not authenticated' }, { status: 401 }) };
  if (!session.isSuperAdmin) return { error: Response.json({ error: 'Only a super admin can change feedback.' }, { status: 403 }) };
  return { session };
}

export async function GET(request, { params }) {
  const { session, error } = await superAdminSession(request);
  if (error) return error;
  const { id } = await params;

  try {
    const response = await getResponse(session.env, id);
    if (!response) return Response.json({ error: 'Feedback not found' }, { status: 404 });
    return Response.json({ response: toPublicResponse(response) });
  } catch (err) {
    console.error('[api/voc/id] GET', err);
    return Response.json({ error: 'Failed to load feedback' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const { session, error } = await superAdminSession(request);
  if (error) return error;
  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = vocUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid feedback' }, { status: 400 });
  }

  try {
    const updated = await updateResponse(session.env, id, parsed.data, session.username);
    if (!updated) return Response.json({ error: 'Feedback not found' }, { status: 404 });
    return Response.json({ response: toPublicResponse(updated) });
  } catch (err) {
    console.error('[api/voc/id] PATCH', err);
    return Response.json({ error: 'Failed to update feedback' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { session, error } = await superAdminSession(request);
  if (error) return error;
  const { id } = await params;

  try {
    const deleted = await deleteResponse(session.env, id, session.username);
    if (!deleted) return Response.json({ error: 'Feedback not found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/voc/id] DELETE', err);
    return Response.json({ error: 'Failed to delete feedback' }, { status: 500 });
  }
}
