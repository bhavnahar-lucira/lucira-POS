// src/app/api/frejun/recording/route.js
// SERVER-ONLY audio proxy for Frejun call recordings (S3 has no CORS headers; Range is forwarded for seeking).
import { getSessionFromRequest } from '@/lib/ornaverse/session';

export const dynamic = 'force-dynamic';

const MAX_REDIRECTS = 5;

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'frejun.com' || host.endsWith('.frejun.com')) return true;
  // S3 virtual-hosted (bucket.s3.region.amazonaws.com) or path-style (s3.region.amazonaws.com)
  return /^([a-z0-9.-]+\.)?s3([.-][a-z0-9-]+)*\.amazonaws\.com$/.test(host);
}

function parseAllowedUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !isAllowedHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response('Unauthenticated', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let target = parseAllowedUrl(searchParams.get('url') || '');
  if (!target) {
    return new Response('Forbidden target url', { status: 403 });
  }

  const headers = {};
  const clientRange = request.headers.get('range');
  if (clientRange) headers.range = clientRange;

  try {
    let upstreamRes;
    for (let hop = 0; ; hop++) {
      upstreamRes = await fetch(target, { method: 'GET', headers, redirect: 'manual', cache: 'no-store' });
      if (upstreamRes.status < 300 || upstreamRes.status >= 400) break;
      const next = parseAllowedUrl(new URL(upstreamRes.headers.get('location') || '', target).toString());
      if (!next || hop >= MAX_REDIRECTS) {
        return new Response('Forbidden redirect target', { status: 403 });
      }
      target = next;
    }

    if (!upstreamRes.ok) {
      console.warn('[recording/route] Upstream returned non-ok status:', upstreamRes.status, upstreamRes.statusText);
      return new Response('Recording unavailable', { status: upstreamRes.status === 404 ? 404 : 502 });
    }

    const buffer = await upstreamRes.arrayBuffer();

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', upstreamRes.headers.get('content-type') || 'audio/wav');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'private, no-store');
    responseHeaders.set('Content-Length', String(buffer.byteLength));
    if (upstreamRes.headers.get('content-range')) {
      responseHeaders.set('Content-Range', upstreamRes.headers.get('content-range'));
    }

    return new Response(buffer, { status: upstreamRes.status, headers: responseHeaders });
  } catch (err) {
    console.error('[API /api/frejun/recording] Proxy error:', err);
    return new Response('Failed to stream audio recording', { status: 502 });
  }
}
