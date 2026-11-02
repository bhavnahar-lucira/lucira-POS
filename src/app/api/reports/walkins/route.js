import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { DATE_RE, isValidCompanyIds, getAuthorizedStores } from '@/lib/reports/serverAccess';
import { fetchVisits } from '@/lib/nonBuyers/server';
import { normalizeMobileKey } from '@/lib/mongo/normalizeMobile';

const istDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
const istTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const clean = (v) => (v && v !== 'NA' ? String(v).trim() : null);

/** Every walk-in visit in the date range (IST) for the selected stores, newest first. */
export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { companyIds, fromDate, toDate } = body ?? {};
  if (!isValidCompanyIds(companyIds) || !DATE_RE.test(fromDate ?? '') || !DATE_RE.test(toDate ?? '') || fromDate > toDate) {
    return Response.json({ error: 'companyIds, fromDate and toDate (YYYY-MM-DD) are required' }, { status: 400 });
  }

  let stores;
  try {
    stores = await getAuthorizedStores(session, companyIds);
  } catch (err) {
    console.error('[api/reports/walkins] store authorization check failed', err);
    return Response.json({ error: 'Could not verify store access' }, { status: 502 });
  }
  if (!stores) return Response.json({ error: 'Not authorized for this store' }, { status: 403 });

  try {
    const perStore = await Promise.all(companyIds.map(async (companyId) => {
      const visits = await fetchVisits(session, companyId, fromDate);
      return visits.flatMap((v) => {
        const at = v.date ? new Date(v.date) : null;
        if (!at || Number.isNaN(at.getTime())) return [];
        const day = istDay.format(at);
        if (day < fromDate || day > toDate) return [];
        return [{
          company_id: companyId,
          visit_id: v.id,
          visited_on: day,
          visited_time: istTime.format(at),
          visited_at: at.toISOString(),
          customer_name: clean(v.customer_name),
          mobile: clean(v.mobile),
          email: clean(v.email),
          source: clean(v.source),
          notes: clean(v.notes),
          person: normalizeMobileKey(clean(v.mobile)) ?? (v.customer_id != null ? `lead:${v.customer_id}` : `visit:${v.id}`),
        }];
      });
    }));

    const rows = perStore.flat();
    // How many times this person came in during the selected period, at that store.
    const counts = new Map();
    for (const row of rows) {
      const key = `${row.company_id}|${row.person}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const row of rows) {
      row.visits_in_period = counts.get(`${row.company_id}|${row.person}`);
      delete row.person;
    }
    rows.sort((a, b) => b.visited_at.localeCompare(a.visited_at));
    return Response.json({ rows });
  } catch (err) {
    console.error('[api/reports/walkins] failed', err);
    return Response.json({ error: 'Walk-in visits report failed' }, { status: err.status === 401 ? 401 : 502 });
  }
}
