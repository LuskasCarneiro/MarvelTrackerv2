import { describe, expect, it } from "vitest";
import { titles, getTitle } from "./catalogue";
import { absoluteUrl, shareImage, titleJsonLd, SITE_URL } from "./seo";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

describe("sitemap", () => {
  const entries = sitemap();

  it("lists the catalogue, the shelf and every title, once each", () => {
    expect(entries).toHaveLength(titles.length + 2);
    expect(new Set(entries.map((e) => e.url)).size).toBe(entries.length);
    expect(entries.map((e) => e.url)).toContain(`${SITE_URL}/`);
    expect(entries.map((e) => e.url)).toContain(`${SITE_URL}/shelf`);
  });

  it("uses absolute URLs on the canonical origin", () => {
    for (const entry of entries) expect(entry.url.startsWith(`${SITE_URL}/`)).toBe(true);
  });

  // A sitemap that advertises the sign-in form or the confirmation route is worse than no
  // sitemap: /auth/confirm carries a one-time token, and a crawler following one burns it.
  it("never advertises the auth routes", () => {
    const disallowed = robots().rules;
    expect(Array.isArray(disallowed) ? disallowed[0].disallow : disallowed.disallow).toEqual(["/auth/", "/sign-in"]);
    for (const entry of entries) {
      expect(entry.url).not.toContain("/auth/");
      expect(entry.url).not.toContain("/sign-in");
    }
  });

  it("points crawlers at the sitemap it actually serves", () => {
    expect(robots().sitemap).toBe(absoluteUrl("/sitemap.xml"));
  });
});

describe("structured data", () => {
  const ironMan = getTitle("iron-man-2008")!;
  const daredevil = titles.find((t) => t.kind === "series" && t.season !== null)!;

  it("describes a film as a Movie and a series as a TVSeries", () => {
    expect(titleJsonLd(ironMan)["@type"]).toBe("Movie");
    expect(titleJsonLd(daredevil)["@type"]).toBe("TVSeries");
  });

  it("carries the facts it has: name, year, runtime, canonical url", () => {
    const data = titleJsonLd(ironMan);
    expect(data.name).toBe(ironMan.displayTitle);
    expect(data.url).toBe(`${SITE_URL}/title/iron-man-2008`);
    expect(data.datePublished).toBe(String(ironMan.releaseYear));
    expect(data.timeRequired).toBe(`PT${ironMan.runtimeMin}M`);
  });

  // The project's rule is that the UI must not present derived things as facts. Structured
  // data is the easiest place to break it, because nobody looks at it — a machine does, and
  // then repeats it. The medium is worked out from the year by a rule; there are no ratings.
  it("claims nothing it cannot support", () => {
    for (const title of titles) {
      const data = titleJsonLd(title);
      expect(data).not.toHaveProperty("aggregateRating");
      expect(data).not.toHaveProperty("review");
      expect(JSON.stringify(data)).not.toContain("Blu-ray");
      expect(JSON.stringify(data)).not.toContain("Steelbook");
      // A four-digit year, never a fabricated month and day.
      expect(String(data.datePublished)).toMatch(/^\d{4}$/);
    }
  });

  it("survives a title with no artwork and no runtime", () => {
    const bare = titles.find((t) => t.poster === null)!;
    const data = titleJsonLd(bare);
    expect(shareImage(bare)).toBeNull();
    expect(data).not.toHaveProperty("image");
    expect(data.name).toBe(bare.displayTitle);
  });

  it("serialises to something a crawler can parse", () => {
    for (const title of titles.slice(0, 20)) {
      expect(() => JSON.parse(JSON.stringify(titleJsonLd(title)))).not.toThrow();
    }
  });
});

describe("share images", () => {
  it("prefers a backdrop, because a link preview is the wrong shape for a poster", () => {
    const withBackdrop = titles.find((t) => t.backdrops.length > 0)!;
    expect(shareImage(withBackdrop)).toContain("/w1280");
  });

  it("falls back to the poster rather than to nothing", () => {
    const posterOnly = titles.find((t) => t.backdrops.length === 0 && t.poster !== null);
    if (posterOnly) expect(shareImage(posterOnly)).toContain("/w780");
  });
});
