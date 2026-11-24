// src/app/api/frejun/analytics/route.js
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getFrejunAnalytics } from '@/lib/frejun/frejunClient';
import { getFrejunScope } from '@/lib/frejun/access';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: false, error: 'Unauthenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateStart = searchParams.get('dateStart') || searchParams.get('date_start') || '';
  const dateEnd = searchParams.get('dateEnd') || searchParams.get('date_end') || '';
  const users = searchParams.get('users') || '';

  try {
    const scope = await getFrejunScope(session);
    let wanted = users.split(',').map((u) => u.trim().toLowerCase()).filter(Boolean);
    if (!scope.isAdmin) {
      const allowed = scope.stores.map((s) => s.email.toLowerCase());
      wanted = wanted.length ? wanted.filter((u) => allowed.includes(u)) : allowed;
      if (!wanted.length) return Response.json({ ok: true, data: [] });
    }

    // FreJun's analytics endpoint 500s whenever `users` is sent, so filter the full list here instead.
    const all = await getFrejunAnalytics({ dateStart, dateEnd });
    const data = wanted.length ? all.filter((row) => wanted.includes(String(row.user).toLowerCase())) : all;

    return Response.json({ ok: true, data });
  } catch (err) {
    console.error('[API /api/frejun/analytics] Error:', err);
    return Response.json({ ok: false, error: err.message || 'Failed to fetch Frejun call analytics' }, { status: 500 });
  }
}
