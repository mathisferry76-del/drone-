import type { MetadataRoute } from "next";

const SITE_URL = "https://min-ia.fr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/historique", "/parrainage"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
