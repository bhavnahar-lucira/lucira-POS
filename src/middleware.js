import { NextResponse } from 'next/server';
import { SESSION_COOKIE_PREFIX } from '@/lib/ornaverse/session';

// (auth) routes — the only pages reachable with no session at all.
// /offline is here too: the service worker precaches it at install time
// (see public/sw.js), and that precache fetch must never get redirected to
// /login, or an unauthenticated install would cache the login page under
// the offline fallback's cache key instead of the real offline message.
const PUBLIC_PATHS = ['/login', '/store-selection', '/offline'];

/**
 * Next.js Middleware — Route Shape Protection
 *
 * Security audit finding (Low, 2026-10-05): this previously only redirected
 * `/` to `/login` — every (pos) route's real gating happened client-side
 * (AuthGuard/StoreGuard), so a fully unauthenticated request still got the
 * whole page shell back before any JS ran or any API call 401'd. The old
 * comment here ("tokens in localStorage, inaccessible at the edge") is from
 * BEFORE the 2026-09-15 auth rewire — the real session now lives in a real
 * httpOnly cookie (see lib/ornaverse/session.js), which middleware CAN read.
 *
 * This still isn't full request authorization — it only checks that the
 * session cookie EXISTS, not that OrnaVerse still considers it valid (that
 * requires an actual network round-trip, which is the API proxy's job on
 * every real request, same as before). What this closes is the "zero
 * session at all" case: no cookie → redirected before the page shell ever
 * renders, instead of after a client-side flash.
 *
 * (Content-Security-Policy lives in next.config.mjs, not here — a
 * hash-based CSP needs no per-request nonce, so it can stay a static header
 * and every page keeps static prerendering. A nonce-based CSP was tried
 * first and reverted: Next.js's own headers() API inside the root layout
 * forces the ENTIRE app into dynamic rendering, which isn't worth the
 * static-rendering/hosting-cost trade-off for this specific app.)
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isPublicPath) {
    const hasSession = request.cookies.has(`${SESSION_COOKIE_PREFIX}0`);
    if (!hasSession) {
      const url = new URL('/login', request.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api            (handled by its own session check, see route.js)
     * - _next/static   (Next.js static files)
     * - _next/image    (Next.js image optimization)
     * - a real public/ static-asset extension at the END of the path —
     *   found live (2026-10-05): the route-gating redirect was catching
     *   /manifest.json itself, since only favicon.ico was excluded by
     *   name. Originally excluded "any path with a dot anywhere," but that
     *   also bypassed the edge auth check for this app's two dynamic
     *   routes (/products/[itemId], /customers/[customerId]) whenever the
     *   segment value itself contains a dot (e.g. /products/1.5) — fixed
     *   (2026-10-10) by anchoring to a real extension at the path's end
     *   instead. Add here if a new static type is added to public/.
     */
    '/((?!api|_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|json|js|css|woff2?)$).*)',
  ],
};
