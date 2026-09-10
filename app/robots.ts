import type { MetadataRoute } from "next";

const SITE_URL = "https://min-ia.fr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /admin/ added during the 2026-09-10 security audit: the throwaway
      // owner-gated test page (app/admin/test-transition) was crawlable —
      // access is still enforced server-side (owner-only), this only stops
      // search engines from indexing internal/test pages. /compte and
      // /preview-3d are the same idea (authenticated account page, isolated
      // 3D prototype never linked from the real site).
      disallow: ["/api/", "/admin/", "/historique", "/parrainage", "/compte", "/preview-3d"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
