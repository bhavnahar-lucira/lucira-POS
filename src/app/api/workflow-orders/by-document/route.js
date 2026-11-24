// Workflow-panel status for OrnaVerse orders, looked up by their document no. (session only).
// ?document_no=A,B,C → { statuses: { A: {...}, ... } }   ·   ?document_no=A&full=1 → { order }
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getWorkflowStatusesByDocumentNos, getWorkflowOrderByDocumentNo } from '@/lib/workflow/workflowOrdersClient';
import { getWorkflowStoreCodes, documentInStores } from '@/lib/workflow/access';

export const dynamic = 'force-dynamic';

const MAX_DOCS = 200;

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requested = [...new Set((searchParams.get('document_no') || '').split(',').map((d) => d.trim()).filter(Boolean))].slice(0, MAX_DOCS);
  if (!requested.length) return Response.json({ error: 'document_no is required' }, { status: 400 });

  try {
    const codes = await getWorkflowStoreCodes(session);
    const docNos = requested.filter((d) => documentInStores(d, codes));
    if (!docNos.length) return Response.json(searchParams.get('full') === '1' ? { order: null } : { statuses: {} });
    if (searchParams.get('full') === '1') {
      return Response.json({ order: await getWorkflowOrderByDocumentNo(docNos[0]) });
    }
    return Response.json({ statuses: await getWorkflowStatusesByDocumentNos(docNos) });
  } catch (err) {
    console.error('[api/workflow-orders/by-document]', err);
    return Response.json({ error: 'Could not load the workflow status' }, { status: 500 });
  }
}

const MAX_BATCH = 2000;

/** POST { document_no: [...] } → { statuses } — for whole store order lists, too long for a query string. */
export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const list = Array.isArray(body?.document_no) ? body.document_no : [];
  const docNos = [...new Set(list.map((d) => String(d).trim()).filter(Boolean))].slice(0, MAX_BATCH);
  if (!docNos.length) return Response.json({ statuses: {} });

  try {
    const codes = await getWorkflowStoreCodes(session);
    const allowed = docNos.filter((d) => documentInStores(d, codes));
    return Response.json({ statuses: await getWorkflowStatusesByDocumentNos(allowed) });
  } catch (err) {
    console.error('[api/workflow-orders/by-document] POST', err);
    return Response.json({ error: 'Could not load the workflow status' }, { status: 500 });
  }
}
