import type { NextConfig } from "next";

// No inline-script nonce setup exists here, and the UI uses plenty of
// React inline `style={{...}}` attributes, so a strict CSP without
// 'unsafe-inline' would silently break both hydration and styling. This
// still meaningfully blocks clickjacking (frame-ancestors), object/plugin
// injection, and third-party base/form hijacking, without requiring a
// nonce-passing rewrite of every component.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://www.googletagmanager.com https://www.google.com https://www.google-analytics.com https://googleads.g.doubleclick.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // @ffmpeg-installer (lib/video-crop.ts, for the portrait-video
  // reframing) locates its platform binary via a computed `require(...)`
  // at runtime — bundling that like ordinary JS makes the bundler try to
  // statically trace through it and choke on the actual binary file it
  // resolves to (not valid source). serverExternalPackages leaves it
  // fully unbundled, using plain Node `require` instead.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  // Still needed alongside that: file tracing has to know to actually copy
  // the binary assets into the deployed function output, since being
  // "external" only means "don't bundle them as JS", not "find their files".
  outputFileTracingIncludes: {
    "/api/animate": ["./node_modules/@ffmpeg-installer/**/*"],
  },
};

export default nextConfig;
