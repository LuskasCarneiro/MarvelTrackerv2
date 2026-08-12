import type { MetadataRoute } from "next";
import { titles } from "@/lib/catalogue";
import { absoluteUrl } from "@/lib/seo";

/**
 * Every page a crawler should know about: the catalogue, the shelf, and all 152 titles.
 *
 * `/sign-in` is deliberately absent — it is a form, not a document, and `robots.ts` disallows
 * it. `/auth/confirm` is a redirect target carrying a one-time token and must never be
 * crawled at all.
 *
 * A Route Handler that is cached by default (see next/docs sitemap.md), which is right here:
 * the catalogue is committed JSON read at module scope, so this is a build-time constant.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 },
    { url: absoluteUrl("/shelf"), changeFrequency: "monthly", priority: 0.8 },
    ...titles.map((title) => ({
      url: absoluteUrl(`/title/${title.slug}`),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
