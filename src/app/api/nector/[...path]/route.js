const NECTOR_READ_BASE = 'https://cachefront.nector.io/api/v2/merchant';
const NECTOR_APIKEY = process.env.NECTOR_API_KEY;
const NECTOR_WORKSPACE = process.env.NECTOR_WORKSPACE_ID;
const ALLOWED_PATHS = new Set(['reviews', 'reviews-count']);

async function proxy(request, { params }) {
  const { path } = await params;

  if (path.length !== 1 || !ALLOWED_PATHS.has(path[0])) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!NECTOR_APIKEY || !NECTOR_WORKSPACE) {
    console.error('[Nector] Missing NECTOR_API_KEY or NECTOR_WORKSPACE_ID env vars');
    return new Response(JSON.stringify({ error: 'Nector not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = `${NECTOR_READ_BASE}/${path.join('/')}${request.nextUrl.search}`;

  const upstreamRes = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'x-apikey':      NECTOR_APIKEY,
      'x-workspaceid': NECTOR_WORKSPACE,
      'x-source':      'web',
      'Content-Type':  'application/json',
    },
    next: { revalidate: 300 },
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
