import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { STARTER_BUNDLES } from "@/lib/starter-bundles";

const LAST_MODIFIED = new Date("2026-03-14T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 1,
    },
    ...STARTER_BUNDLES.map((bundle) => ({
      url: `${SITE_URL}/?id=${encodeURIComponent(bundle.id)}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
