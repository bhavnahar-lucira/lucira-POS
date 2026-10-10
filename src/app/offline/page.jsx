// Served by the service worker (public/sw.js) when a navigation fails with
// no network and nothing better is already cached for that exact URL.
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold text-foreground">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Lucira POS needs an internet connection to load prices, stock and
        customer data. Reconnect and try again.
      </p>
    </div>
  );
}
