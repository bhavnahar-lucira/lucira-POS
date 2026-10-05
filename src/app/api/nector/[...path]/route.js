import { randomUUID } from 'crypto';
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { findShopifyCustomer } from '@/lib/shopify/adminCustomer';

const NECTOR_READ_BASE  = 'https://cachefront.nector.io/api/v2/merchant';
const NECTOR_WRITE_BASE = 'https://platform.nector.io/api/v2/merchant';
const NECTOR_CHECKOUT_BASE = 'https://platform.nector.io/api/open/integrations/customcheckoutwebhook';
const NECTOR_APIKEY = process.env.NECTOR_API_KEY;
const NECTOR_WORKSPACE = process.env.NECTOR_WORKSPACE_ID;
const NECTOR_WEBHOOK_KEY = process.env.NECTOR_WEBHOOK_KEY;
const ALLOWED_PATHS = new Set(['reviews', 'reviews-count', 'leads', 'wallettransactions', 'checkout']);
const WRITE_PATHS = new Set(['wallettransactions', 'checkout']);

async function proxy(request, { params }) {
  const { path } = await params;

  if (path.length !== 1 || !ALLOWED_PATHS.has(path[0])) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const isCheckout = path[0] === 'checkout';

  if (isCheckout ? !NECTOR_WEBHOOK_KEY : (!NECTOR_APIKEY || !NECTOR_WORKSPACE)) {
    console.error(isCheckout
      ? '[Nector] Missing NECTOR_WEBHOOK_KEY env var'
      : '[Nector] Missing NECTOR_API_KEY or NECTOR_WORKSPACE_ID env vars');
    return new Response(JSON.stringify({ error: 'Nector not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (WRITE_PATHS.has(path[0]) && !(await getSessionFromRequest(request))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let targetUrl;
  if (isCheckout) {
    targetUrl = `${NECTOR_CHECKOUT_BASE}/${NECTOR_WEBHOOK_KEY}`;
  } else {
    const upstreamPath = path[0] === 'leads' ? `leads/${randomUUID()}` : path.join('/');
    const base = WRITE_PATHS.has(path[0]) ? NECTOR_WRITE_BASE : NECTOR_READ_BASE;
    targetUrl = `${base}/${upstreamPath}${request.nextUrl.search}`;
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  let body = hasBody ? await request.text() : undefined;
  if (isCheckout && body) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!parsed.customer_id && (parsed.mobile || parsed.email)) {
      const customer = await findShopifyCustomer({ mobile: parsed.mobile, email: parsed.email });
      if (!customer) {
        return new Response(JSON.stringify({ data: { message: 'No matching Shopify customer' } }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const { mobile: _mobile, email: _email, ...rest } = parsed;
      body = JSON.stringify({ ...rest, customer_id: `shopify-${customer.numericId}` });
    }
  }

  const upstreamRes = await fetch(targetUrl, {
    method: request.method,
    headers: isCheckout
      ? { 'x-source': 'web', 'Content-Type': 'application/json' }
      : {
          'x-apikey':      NECTOR_APIKEY,
          'x-workspaceid': NECTOR_WORKSPACE,
          'x-source':      'web',
          'Content-Type':  'application/json',
        },
    body,
    ...(path[0] === 'reviews' || path[0] === 'reviews-count'
      ? { next: { revalidate: 300 } }
      : { cache: 'no-store' }),
  });

  const responseBody = await upstreamRes.arrayBuffer();
  return new Response(responseBody, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': upstreamRes.headers.get('content-type') ?? 'application/json',
    },
  });
}

export { proxy as GET, proxy as POST };
