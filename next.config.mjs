/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  images: {
    unoptimized: false,
    minimumCacheTTL: 60 * 60 * 24 * 7,
    deviceSizes: [384, 640, 750, 828, 1080, 1200],
    imageSizes: [32, 48, 64, 96, 128, 256],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lucira.live.ornaverse.in',
      },
      {
        protocol: 'https',
        hostname: 'lucira.uat.ornaverse.in',
      },
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
      },
      {
        // Nector-hosted customer review photos (see ProductReviewsList).
        protocol: 'https',
        hostname: 'cdn.nector.io',
      },
    ],
  },

  // ── HTTP SECURITY HEADERS (SEC-008) ──────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // camera=(self) — the Barcode Scanner (BarcodeScannerModal) needs
            // getUserMedia camera access. A blanket `camera=()` here overrides
            // any per-site "Allow" the user grants in the browser — the
            // Permissions-Policy header wins over Chrome's own site setting,
            // which is why scanning failed with "Camera permission denied"
            // even when Chrome's camera permission showed Allow. Microphone/
            // geolocation stay locked down — nothing in the app uses them.
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  // NOTE: '/api/:path*' used to be proxied here via rewrites(). That
  // mechanism returned empty-body 400s from nginx on business-data
  // endpoints even with a valid bearer token — see
  // src/app/api/[...path]/route.js, which replaces it with an explicit
  // server-side fetch we fully control. A filesystem route always wins
  // over a rewrite for the same path, so this config needs nothing here.
};

export default nextConfig;
