// Root layout — wraps the entire app in Providers.
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
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lucira POS',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

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
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
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
        <Providers>
          <RehydrationGuard />
          {children}
        </Providers>
      </body>
    </html>
  );
}
