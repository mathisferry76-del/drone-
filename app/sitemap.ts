import type { MetadataRoute } from "next";

const SITE_URL = "https://min-ia.fr";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/generate",
    "/pricing",
    "/login",
    "/mentions-legales",
    "/cgv",
    "/confidentialite",
  ];
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
  }));
}
