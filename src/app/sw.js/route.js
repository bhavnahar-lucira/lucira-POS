// Serves the service worker as a route (not a public/ static file) so its
// bytes genuinely change on every deploy — a plain static file stays
// byte-identical across deploys that don't touch it directly, which means
// the browser's native "is there a new service worker?" check (a byte
// comparison of this exact response) would never find anything new, and an
// installed app kept open across a deploy would never learn about it. The
// build-id comment below forces a real byte difference every deployment.
//
// BUILD_ID is read once per server process/deployment (module scope, not
// per-request) — recomputing it per request would make every fetch look
// like a new version and the app would think it needs to update constantly.
// Route handlers are cacheable-by-default in the App Router unless marked
// dynamic — without this, Next could serve one build's response forever,
// defeating the whole point of stamping a per-deploy BUILD_ID below.
export const dynamic = 'force-dynamic';

const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA
  ?? process.env.VERCEL_DEPLOYMENT_ID
  ?? String(Date.now());

const SERVICE_WORKER_SOURCE = `// Lucira POS service worker — offline app-shell support + safe auto-update.
//
// Deliberately hand-written, not next-pwa/Workbox — this Next.js version
// (Turbopack) is too new for those libraries' compatibility to be relied on
// right now. Scope, by design:
//   - The app shell + whatever static assets get requested while online are
//     cached, so the app still LOADS with no network.
//   - Every real API call (/api/* — this app's own proxy for every
//     Services/* OrnaVerse call) is network-ONLY, never cached. This is a
//     jewelry POS; a stale cached price/stock number is a real money
//     problem, not a UX inconvenience. Offline means "the app is visible",
//     never "transactions still work".
//   - Update flow: this file is served by a route (src/app/sw.js/route.js),
//     not a static public/ file, specifically so a BUILD_ID stamp makes its
//     bytes change on every deploy — a plain static file would stay
//     byte-identical across deploys that don't touch it, and the browser's
//     update check is a pure byte comparison. The new worker installs but
//     does NOT self-activate (no skipWaiting() here) — it waits for an
//     explicit SKIP_WAITING message from the page, which the page only
//     sends once it's safe to reload (see ServiceWorkerRegistration — it
//     holds off while a sale is mid-payment).

const SHELL_CACHE = 'lucira-pos-shell-v1';
const RUNTIME_CACHE = 'lucira-pos-runtime-v1';
const KNOWN_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

// Small and deliberately static — NOT an attempt to precache hashed JS/CSS
// chunks (those change every deploy; the runtime strategy below caches them
// opportunistically as they're actually requested instead).
const SHELL_URLS = ['/offline', '/manifest.json', '/icon-192.png', '/icon-512.png'];

const MAX_RUNTIME_ENTRIES = 100;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {
      // Best-effort — one missing/failed shell asset must never block the
      // whole service worker from installing.
    }))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !KNOWN_CACHES.includes(n)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// The page tells us when it's safe to take over — see ServiceWorkerRegistration.
// Never self-activate on install; that would hijack an open tab (e.g.
// mid-checkout) the instant a deploy happens.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isLiveData(url) {
  return url.pathname.startsWith('/api/');
}

async function trimRuntimeCache() {
  const cache = await caches.open(RUNTIME_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_RUNTIME_ENTRIES) {
    await cache.delete(keys[0]); // oldest insertion first
  }
}

// Navigations: always prefer the network (so a redeploy's new HTML/JS
// references are picked up immediately on next real visit), only falling
// back to whatever was last cached for this exact URL, or the dedicated
// offline page, if the network is genuinely unreachable.
async function networkFirst(request) {
  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    if (fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match(request)) ?? (await cache.match('/offline'));
  }
}

// Static assets (JS/CSS/fonts/images): cache-first, since content-hashed
// filenames mean a cached copy is NEVER stale — a new deploy produces new
// filenames, not new content behind the same one.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    trimRuntimeCache();
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never intercept writes

  const url = new URL(request.url);

  // This worker's OWN script must never be cached by itself — the browser's
  // update check (and any page-level fetch of it) has to always see the
  // real current bytes, or a new deploy would be invisible forever. This
  // bit us for real: cacheFirst was serving this exact URL from a previous
  // deploy's cache, masking every later one.
  if (url.pathname === '/sw.js') return;

  // Real data: always live, never cached, no offline fallback — failing
  // clearly beats silently showing stale pricing/stock.
  if (isLiveData(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  }
});
`;

export async function GET() {
  const body = `// build:${BUILD_ID}\n${SERVICE_WORKER_SOURCE}`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
