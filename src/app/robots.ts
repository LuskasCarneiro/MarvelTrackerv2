import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // `/auth/confirm` receives a one-time token in the query string; a crawler following
      // one would burn it. `/sign-in` is a form, not a document.
      disallow: ["/auth/", "/sign-in"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
