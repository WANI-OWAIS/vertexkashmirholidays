import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

// Host of the branded placeholder image (env-driven so it follows the
// deployment). Added to image remotePatterns so next/image can serve it.
const PLACEHOLDER_HOST = (() => {
  try {
    return new URL(
      process.env.NEXT_PUBLIC_PLACEHOLDER_IMAGE ??
        "https://vertexkashmirholidays.com/uploads/general/1782136262740-dy3wqa.svg",
    ).hostname;
  } catch {
    return "vertexkashmirholidays.com";
  }
})();

// Security headers applied to every response via headers(). CSP is intentionally
// absent here — it is set per-request with a fresh nonce in src/proxy.ts
// (middleware) so that 'strict-dynamic' nonce-based enforcement works correctly.
// A static CSP baked at build time cannot contain per-request nonces.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    // camera / microphone / display-capture must be allowed for the Jitsi iframe
    // (meet.jit.si) that external_api.js mounts.  All other sensitive features
    // remain blocked.  The old camera=() / microphone=() blanket-blocked every
    // iframe including Jitsi, making audio/video calls impossible.
    key: "Permissions-Policy",
    value: [
      'camera=(self "https://meet.jit.si" "https://8x8.vc" "https://*.8x8.vc")',
      'microphone=(self "https://meet.jit.si" "https://8x8.vc" "https://*.8x8.vc")',
      'display-capture=(self "https://meet.jit.si" "https://8x8.vc" "https://*.8x8.vc")',
      'fullscreen=(self "https://8x8.vc" "https://*.8x8.vc")',
      "geolocation=()",
      "browsing-topics=()",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  experimental: {
    // Barrel-optimize these icon/animation/chart packages so importing a few
    // symbols doesn't pull the whole package into a route's bundle. recharts is
    // the meaningful add here (framer-motion and lucide-react are already in
    // Next's built-in default list); keeping all three explicit documents intent.
    optimizePackageImports: ["framer-motion", "lucide-react", "recharts"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // /campaign was renamed to /adventures (better reflects the seasonal
    // adventure/offbeat content — Gurez Offbeat, LOC, trekking, skiing — and is
    // stronger for Google/Meta search intent than the internal "campaign" term).
    // Permanent redirect preserves SEO equity for already-indexed URLs.
    return [
      // Host-scoped variants of the two rules below, placed first so a
      // .vercel.app request hitting an old /campaign URL gets a single 308
      // straight to the final production /adventures URL, instead of one 308
      // renaming the path (still on .vercel.app) followed by a second 308
      // canonicalizing the host — two hops to reach the same destination.
      {
        source: "/campaign",
        has: [{ type: "host", value: "vertexkashmirholidays.vercel.app" }],
        destination: "https://vertexkashmirholidays.com/adventures",
        permanent: true,
      },
      {
        source: "/campaign/:slug*",
        has: [{ type: "host", value: "vertexkashmirholidays.vercel.app" }],
        destination: "https://vertexkashmirholidays.com/adventures/:slug*",
        permanent: true,
      },
      { source: "/campaign", destination: "/adventures", permanent: true },
      { source: "/campaign/:slug*", destination: "/adventures/:slug*", permanent: true },
      // Canonical domain enforcement: Vercel's default *.vercel.app URL always
      // stays live alongside the custom domain. Without this, visitors (and
      // Google) can reach the site on either host — splitting SEO signals and,
      // combined with trustHost in auth.config.ts, making auth/session cookies
      // host-specific to whichever domain was used. Redirect everything to the
      // real domain so there's exactly one canonical host in practice.
      {
        source: "/:path*",
        has: [{ type: "host", value: "vertexkashmirholidays.vercel.app" }],
        destination: "https://vertexkashmirholidays.com/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    // Serve modern formats; Next negotiates AVIF → WebP → original per browser.
    formats: ["image/avif", "image/webp"],
    // Cache optimized images aggressively (31 days) to cut repeat-view cost.
    minimumCacheTTL: 2678400,
    // Brand logo lockups are SVG (served from /public). Allow next/image to
    // render them; CSP sandbox prevents script execution inside the SVG.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: PLACEHOLDER_HOST,
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
      {
        // YouTube thumbnail images (B2B intro video embed's click-to-play poster).
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/**",
      },
    ],
    qualities: [60, 75, 85],
  },
};

export default withAnalyzer(nextConfig);
