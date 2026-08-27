import type { MetadataRoute } from "next";

const SITE_URL = "https://saas-kappa-nine.vercel.app";

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
