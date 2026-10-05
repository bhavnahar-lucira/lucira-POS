import { UPSTREAM } from '@/lib/ornaverse/upstream';
import { getSessionFromRequest, renewSessionFromUpstream, buildSessionCookieHeaders } from '@/lib/ornaverse/session';
import { getCachedRead, setCachedRead, isCacheableReadPath } from '@/lib/security/proxyReadCache';

const PUBLIC_PATH_PREFIXES = ['upload/'];
const ADMIN_ONLY_PATHS = ['Services/POS/Customer/Update'];

async function proxy(request, { params }) {
  const { path } = await params;
  const resolvedPath = path.join('/');
  const targetUrl = `${UPSTREAM}/${resolvedPath}${request.nextUrl.search}`;
  const isPublicPath = PUBLIC_PATH_PREFIXES.some((prefix) => resolvedPath.startsWith(prefix));

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  let session = null;
  if (!isPublicPath) {
    session = await getSessionFromRequest(request);
    if (!session) {
      return new Response(
        JSON.stringify({ error: 'not_authenticated', error_description: 'Sign in again.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (ADMIN_ONLY_PATHS.includes(resolvedPath) && !session.isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'admin_only', error_description: 'Only an admin can edit customer details.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }

    headers.set('Cookie', session.cookie);
    if (session.csrf) headers.set('X-CSRF-TOKEN', session.csrf);
  }
  
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;
  
  const cacheKey = isCacheableReadPath(resolvedPath)
    ? `${resolvedPath}::${body ? Buffer.from(body).toString('utf-8') : ''}`
    : null;
  if (cacheKey) {
    const cached = getCachedRead(cacheKey);
    if (cached) {
      return new Response(cached.bytes, {
        status: cached.status,
        headers: { 'Content-Type': cached.contentType },
      });
    }
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[api proxy] upstream fetch failed', targetUrl, err);
    return new Response(
      JSON.stringify({
        error: 'upstream_unreachable',
        error_description: 'Could not reach the OrnaVerse server. Please check your connection and try again.',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const responseContentType = upstreamRes.headers.get('content-type') ?? 'application/json';
  const renewed = session ? renewSessionFromUpstream(session, upstreamRes) : null;
  const setCookieHeaders = renewed ? buildSessionCookieHeaders(renewed) : [];

  if (cacheKey && upstreamRes.ok) {
    const bytes = await upstreamRes.arrayBuffer();
    setCachedRead(cacheKey, { bytes, status: upstreamRes.status, contentType: responseContentType });
    const res = new Response(bytes, { status: upstreamRes.status, headers: { 'Content-Type': responseContentType } });
    for (const header of setCookieHeaders) res.headers.append('Set-Cookie', header);
    return res;
  }
  const res = new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: { 'Content-Type': responseContentType },
  });
  for (const header of setCookieHeaders) res.headers.append('Set-Cookie', header);
  return res;
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as DELETE,
  proxy as PATCH,
};
