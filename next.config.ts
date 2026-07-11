import type { NextConfig } from "next";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [],
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
  "img-src 'self' data: blob: https://*.supabase.co",
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
    ];
  },
} satisfies NextConfig);

export default nextConfig;
