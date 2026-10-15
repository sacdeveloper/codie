import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Separate build output for the local E2E stack so it never clobbers a normal build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Playwright must not be bundled; it is loaded at runtime on the server only.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // The serverless Chromium binary is loaded from disk at runtime, so it must be traced into the functions.
  outputFileTracingIncludes: { "/**": ["./node_modules/@sparticuz/chromium/bin/**"] },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
