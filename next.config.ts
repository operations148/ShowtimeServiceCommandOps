import type { NextConfig } from "next";

// Phase 8 (ADR-0015): technician offline resilience. runtimeCaching is scoped
// to TECH routes + TECH GET APIs only — never the dashboard or the customer
// portal (the portal is explicitly no-store, Phase 7). Reads fall back to the
// last-synced snapshot offline; writes (POST/PATCH/DELETE) are never cached.
// Honors the NEXT_PUBLIC_OFFLINE_SYNC_ENABLED kill-switch at build time.
const offlineEnabled = process.env.NEXT_PUBLIC_OFFLINE_SYNC_ENABLED !== "false";

const techRuntimeCaching = [
  {
    // Tech GET APIs (today's jobs, visit reads) — last-synced snapshot offline.
    urlPattern: ({ url, request, sameOrigin }: { url: URL; request: Request; sameOrigin: boolean }) =>
      sameOrigin && request.method === "GET" && url.pathname.startsWith("/api/visits"),
    handler: "NetworkFirst",
    options: {
      cacheName: "tech-visits-api",
      networkTimeoutSeconds: 4,
      expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
  {
    // Tech app-shell navigations — the job view loads offline for jobs already
    // opened while online.
    urlPattern: ({ url, request, sameOrigin }: { url: URL; request: Request; sameOrigin: boolean }) =>
      sameOrigin && request.mode === "navigate" && url.pathname.startsWith("/tech"),
    handler: "NetworkFirst",
    options: {
      cacheName: "tech-pages",
      networkTimeoutSeconds: 4,
      expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
    },
  },
];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: offlineEnabled ? techRuntimeCaching : [],
});

// Security headers (security-audit M9 — none were configured at all).
// CSP is intentionally moderate rather than nonce-based: Next.js App Router's
// own hydration bootstrap needs 'unsafe-inline' for script-src without a
// nonce-wiring pass, which is out of scope for this change. Verify in a real
// browser against a deployed preview before relying on this as a hard XSS
// backstop — this has been build-verified only, not browser-verified.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = withPWA({
  // pdfkit is CJS and reads internal font files via require() at runtime.
  // Keeping it external prevents webpack from mangling those require() paths.
  // sharp ships native (.node) bindings per-platform — bundling it can break
  // on Vercel's serverless runtime if webpack tries to trace/copy the binary;
  // externalizing it is the standard fix.
  serverExternalPackages: ["pdfkit", "sharp"],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Customer portal (Phase 7): sensitive per-customer data must never be
        // cached by browsers, proxies, or the bfcache. Applies to portal pages
        // and portal API responses. The service worker precaches static JS/CSS
        // only — never these routes — so no-store here is the whole story.
        source: "/portal/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" }],
      },
      {
        source: "/api/portal/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" }],
      },
    ];
  },
} satisfies NextConfig);

export default nextConfig;
