import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { postUpstream } from '@/lib/reports/serverAccess';
import API from '@/constants/apiEndpoints';

const CHUNK = 500;
const clean = (v) => (v && v !== 'NA' ? v : null);

/** POST { ids: number[] } (CRM customer ids) → { [id]: { jc, sourceId, budget, interestTypeIds, isCustomer, notes } } */
export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const ids = [...new Set((body?.ids ?? []).map(Number).filter(Number.isInteger))].slice(0, 5000);
  if (!ids.length) return Response.json({ details: {} });
  try {
    const chunks = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    const [customers, employees] = await Promise.all([
      Promise.all(chunks.map((chunk) => postUpstream(session, API.CRM.CUSTOMER_LIST, { Take: 0, Criteria: [['customer_id'], 'in', [chunk]] }))),
      postUpstream(session, API.HR.EMPLOYEE_LIST, { Take: 0 }),
    ]);
    const names = new Map((employees?.Entities ?? []).map((e) => [e.employee_id, e.employee_name]));
    const details = {};
    for (const c of customers.flatMap((d) => d?.Entities ?? [])) {
      const jcId = c.sales_representative_id;
      details[c.customer_id] = {
        jc: jcId != null ? (names.get(jcId) ?? `Former employee #${jcId}`) : null,
        sourceId: c.source_id || null,
        budget: c.budget || null,
        interestTypeIds: Array.isArray(c.interest) ? c.interest.map((i) => (typeof i === 'object' ? i.type_id : i)).filter((v) => v != null) : [],
        isCustomer: !!c.party_id,
        notes: clean(c.notes),
      };
    }
    return Response.json({ details });
  } catch (err) {
    console.error('[api/walkins/details] POST', err?.message);
    return Response.json({ error: 'Failed to load walk-in details' }, { status: 502 });
  }
}
