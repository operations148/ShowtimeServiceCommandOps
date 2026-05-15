import type { NextConfig } from "next";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [],
});

const nextConfig: NextConfig = withPWA({
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/font",
    "@react-pdf/layout",
    "@react-pdf/primitives",
    "@react-pdf/fns",
    "@react-pdf/stylesheet",
    "@react-pdf/textkit",
    "@react-pdf/png-js",
  ],
} satisfies NextConfig);

export default nextConfig;
