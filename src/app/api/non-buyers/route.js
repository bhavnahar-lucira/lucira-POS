import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getAuthorizedCompanyIds } from '@/lib/ornaverse/authorizedStores';
import { getNonBuyers, getNonBuyersAllStores, pageNonBuyers } from '@/lib/nonBuyers/server';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE = 200;

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  // "all" (every store) is for super admins only; everyone else must name one of their stores.
  const allStores = params.get('company_id') === 'all';
  if (allStores && !session.isSuperAdmin) {
    return Response.json({ error: 'Not authorized for all stores' }, { status: 403 });
  }
  const companyId = Number(params.get('company_id'));
  if (!allStores && (!Number.isInteger(companyId) || companyId <= 0)) {
    return Response.json({ error: 'company_id is required' }, { status: 400 });
  }
  const fromDate = params.get('from') ?? '';
  const toDate = params.get('to') ?? '';
  if ((fromDate && !DATE_RE.test(fromDate)) || (toDate && !DATE_RE.test(toDate))) {
    return Response.json({ error: 'Invalid date' }, { status: 400 });
  }
  const minVisits = Math.max(1, Number(params.get('minVisits')) || 2);
  const skip = Math.max(0, Number(params.get('skip')) || 0);
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(params.get('limit')) || 48));

  // A store login only ever sees its own stores (same rule as /api/buyers).
  if (!session.isSuperAdmin) {
    try {
      const authorized = await getAuthorizedCompanyIds(session);
      if (!authorized.has(companyId)) return Response.json({ error: 'Not authorized for this store' }, { status: 403 });
    } catch (err) {
      console.error('[api/non-buyers] store authorization check failed', err);
      return Response.json({ error: 'Could not verify store access' }, { status: 502 });
    }
  }

  try {
    const options = { fromDate, toDate, minVisits, refresh: params.get('refresh') === '1' };
    const rows = allStores
      ? await getNonBuyersAllStores({ session, ...options })
      : await getNonBuyers({ session, companyId, ...options });
    return Response.json(pageNonBuyers(rows, {
      search: params.get('search') ?? '', sort: params.get('sort') ?? 'visits', skip, limit,
    }));
  } catch (err) {
    console.error('[api/non-buyers] GET', err);
    return Response.json({ error: 'Could not load non-buyers' }, { status: 502 });
  }
}
