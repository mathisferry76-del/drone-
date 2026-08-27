import type { MetadataRoute } from "next";

const SITE_URL = "https://saas-kappa-nine.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/generate", "/pricing", "/login"];
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
  }));
}
