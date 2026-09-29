// Server-side reverse proxy for every OrnaVerse API call. Forwards each
// method straight through; a filesystem route always wins over a
// next.config.mjs rewrite for the same path. UPSTREAM resolves from
// lib/ornaverse/upstream.js — switch environments there, not here.
//
// Authenticates with the operator's own OrnaVerse cookie session (see
// lib/ornaverse/session.js) rather than an OAuth bearer token — this is
// the exact mechanism OrnaVerse's own client uses for its users, adopted
// here after the 2026-09 auth rewire.
//
// EXCEPTION — `upload/*`: OrnaVerse serves uploaded product images from
// this path with NO authentication of its own (confirmed live: a bare,
// cookie-less request to `${UPSTREAM}/upload/...` returns the image
// directly). Every <Image src="/api/upload/...">'s resolveImageSrc()
// output goes through here, and Next's own image optimizer fetches that
// URL SERVER-SIDE (not from the browser) whenever there's no custom
// `loader` — a request that can never carry the operator's session
// cookie, since it isn't the browser making it. Requiring a session for
// this path the same way Services/* needs one made every such image
// 401 and fall back to "No image available" — confirmed live, and fixed
// here by matching OrnaVerse's own public access for exactly this prefix,
// nothing else.
import { UPSTREAM } from '@/lib/ornaverse/upstream';
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getCachedRead, setCachedRead, isCacheableReadPath } from '@/lib/security/proxyReadCache';

const PUBLIC_PATH_PREFIXES = ['upload/'];

// Customer editing is admin-only (2026-09-28, explicit direction) — hiding
// the Edit UI for non-admins is a courtesy, this is the actual gate. Only
// Update is blocked; Create stays open to every operator.
const ADMIN_ONLY_PATHS = ['Services/POS/Customer/Update'];

async function proxy(request, { params }) {
  const { path } = await params;
  const resolvedPath = path.join('/');
  const targetUrl = `${UPSTREAM}/${resolvedPath}${request.nextUrl.search}`;
  const isPublicPath = PUBLIC_PATH_PREFIXES.some((prefix) => resolvedPath.startsWith(prefix));

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  if (!isPublicPath) {
    const session = await getSessionFromRequest(request);
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
  const body = hasBody ? await request.text() : undefined;

  // Short-TTL cache for a small allowlist of read-only, tenant-wide
  // reference endpoints (payment modes, sales persons, document numbering,
  // today's metal rate) — see lib/security/proxyReadCache.js. Keyed on
  // path+body, not just path, since these are POST reads that vary by
  // company_id in the body.
  const cacheKey = isCacheableReadPath(resolvedPath) ? `${resolvedPath}::${body ?? ''}` : null;
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

  if (cacheKey && upstreamRes.ok) {
    const bytes = await upstreamRes.arrayBuffer();
    setCachedRead(cacheKey, { bytes, status: upstreamRes.status, contentType: responseContentType });
    return new Response(bytes, { status: upstreamRes.status, headers: { 'Content-Type': responseContentType } });
  }

  // Streamed straight through (not buffered) for everything else, so a
  // large response doesn't hold this invocation's memory/CPU active for
  // the whole download.
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: { 'Content-Type': responseContentType },
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as DELETE,
  proxy as PATCH,
};
