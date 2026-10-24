import { getWebsiteActivity } from '@/lib/mongo/websiteActivity';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

export async function GET(request) {
  if (!(await getSessionFromRequest(request))) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const mobile = url.searchParams.get('customer_mobile') || null;
  const email  = url.searchParams.get('customer_email') || null;
  if (!mobile && !email) {
    return Response.json({ error: 'customer_mobile or customer_email is required' }, { status: 400 });
  }

  try {
    const activity = await getWebsiteActivity({ mobile, email });
    return Response.json(activity);
  } catch (err) {
    console.error('[api/customers/website-activity] GET', err);
    return Response.json({ error: 'Failed to fetch website activity' }, { status: 500 });
  }
}
