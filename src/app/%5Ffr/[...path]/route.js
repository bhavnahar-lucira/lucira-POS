import { UPSTREAM } from '@/lib/ornaverse/upstream';
import { getSessionFromRequest } from '@/lib/ornaverse/session';

async function proxy(request, { params }) {
  const { path } = await params;
  const session = await getSessionFromRequest(request);
  
  if (!session) {
    return new Response('Report session unavailable.', { status: 401 });
  }

  if (path.some((segment) => segment === '.' || segment === '..')) {
    return new Response('Invalid path.', { status: 400 });
  }

  const targetUrl = new URL(path.join('/'), `${UPSTREAM}/_fr/`);
  if (
    targetUrl.origin !== new URL(UPSTREAM).origin ||
    !targetUrl.pathname.startsWith('/_fr/')
  ) {
    return new Response('Invalid path.', { status: 400 });
  }
  targetUrl.search = request.nextUrl.search;

  const headers = { Cookie: session.cookie };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;
  if (session.csrf) headers['X-CSRF-TOKEN'] = session.csrf;
  
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const upstreamRes = await fetch(targetUrl, {
    method:   request.method,
    headers,
    body,
    cache:    'no-store',
    redirect: 'manual',
  });

  const responseBody = await upstreamRes.arrayBuffer();
  return new Response(responseBody, {
    status:  upstreamRes.status,
    headers: {
      'Content-Type': upstreamRes.headers.get('content-type') ?? 'application/octet-stream',
    },
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as DELETE,
  proxy as PATCH,
};
