// Root layout — wraps the entire app in Providers.
// SEC-002: Checks token expiry immediately after Redux Persist rehydrates.
//          If the stored token is expired, auth state is cleared before
//          any protected route renders, preventing stale-token access.
// SEC-006: Bootstraps the idle timeout hook so it runs globally across
//          all authenticated sessions.

import Script from "next/script";
import Providers from '@/components/shared/Providers';
import RehydrationGuard from '@/components/shared/RehydrationGuard';
import "./globals.css";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const metadata = {
  title: 'Lucira POS',
  description: 'Point of Sale System — Lucira Jewelry',
  icons: {
    icon: "https://luciraonline.myshopify.com/cdn/shop/files/Favicon_New_10.png?crop=center&height=32&v=1767615434&width=32",
    apple: "https://luciraonline.myshopify.com/cdn/shop/files/Favicon_New_10.png?crop=center&height=32&v=1767615434&width=32",
  },
  // Installable as an app — public/manifest.json (a plain static file, not
  // Next's dynamic app/manifest.js generator) is what Chrome/Android reads
  // for "Install app". No service worker backs this (removed 2026-10-01,
  // explicit direction) — modern Chrome/Edge offer the install prompt off
  // the manifest alone; see public/manifest.json's own header if that ever
  // needs revisiting. appleWebApp below is iOS Safari's separate, older
  // "Add to Home Screen" mechanism, which ignores the web manifest entirely
  // and only reads these meta tags.
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lucira POS',
  },
  // `appleWebApp.capable` alone only renders the modern, non-prefixed
  // "mobile-web-app-capable" tag (confirmed by reading this Next.js
  // version's own metadata renderer) — older iOS/iPadOS Safari versions
  // specifically check the legacy Apple-prefixed name for standalone-mode
  // home-screen installs, so both are sent rather than relying on iOS
  // having caught up to the new one everywhere a POS tablet might run.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

// themeColor lives on this separate `viewport` export (not `metadata`) as of
// the Next.js version this app runs — tints the browser chrome (Android
// Chrome's address bar, the splash screen background while the installed
// app launches) to match the manifest's own theme_color.
export const viewport = {
  themeColor: '#5A413F',
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className="font-figtree h-full antialiased"
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning (both here and on <body>) — reported
          directly: refreshing /catalog (and, confirmed in the dev log,
          /login too) sometimes leaves the page fetching nothing at all.
          Root-caused via the dev server's own error output: a real
          hydration-mismatch error on THIS exact tag (`cz-shortcut-listen`,
          `__api_sniffer_speed_meter_host` — browser-extension-injected
          attributes present before React hydrates, not anything this app
          renders differently server vs client). React's response to any
          hydration mismatch is to discard and fully re-render the whole
          tree from here down — Redux's PersistGate, react-query's
          PersistQueryClientProvider, and every page below it all remount
          unexpectedly mid-load, which is exactly the kind of surprise
          remount that can leave an in-flight catalog fetch orphaned.
          suppressHydrationWarning on html/body is the standard, safe fix
          for this specific class of mismatch (extension-mutated
          attributes on these two tags only) — it does NOT suppress a
          hydration mismatch anywhere else in the app, only false
          positives on these two root tags. */}
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        {/*
          GA4 — only rendered when NEXT_PUBLIC_GA_MEASUREMENT_ID is set
          (e.g. missing in a bare dev checkout), so analytics being
          unconfigured never breaks the app. See src/lib/analytics/gtag.js
          for the dispatch helper every event goes through.
        */}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
                // Tags EVERY event in this GA4 property as POS-originated —
                // including GA4's own automatically-collected events
                // (page_view, session_start, ...) that never go through
                // tracker.js. See src/lib/analytics/events.js and the
                // analytics docs for why this exists: this app may one day
                // share a GA4 property with the Shopify storefront, and
                // "utm_source" is how the two get told apart in reports.
                gtag('set', 'user_properties', { utm_source: 'pos' });
              `}
            </Script>
          </>
        )}

        {/*
          WebEngage — no client SDK loaded here anymore (2026-09-28). The
          Web SDK bootstrap that used to live in this spot console-errored
          on every single page load ("incorrectly configured" — this
          tenant's domain was never registered for it) regardless of
          whether any event ever fired. Both events and user-identity sync
          now go entirely through our own REST relay
          (src/lib/analytics/webengageServer.js /
          src/app/api/analytics/webengage/**), which never touches the
          browser at all beyond a same-origin fetch — see webengageBridge.js.
        */}
        <Providers>
          {/*
            RehydrationGuard runs two jobs on mount (client-side only):
            1. SEC-002 — Checks if the rehydrated access token is expired.
                         If so, dispatches logout() before any child renders.
            2. SEC-006 — Activates the idle timeout listener so the customer
                         session auto-detaches after 15 minutes of inactivity.
          */}
          <RehydrationGuard />
          {children}
        </Providers>
      </body>
    </html>
  );
}
