import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

// Route list: add new routes here as they're created
const ROUTES = [
  {
    path: "/",
    slug: "home",
  },
  // A film.
  { path: "/title/iron-man-2008", slug: "title-iron-man-2008" },
  // A series season (season 2 of 3, and a title that repeats across the catalogue —
  // exercises both the data block's Year disambiguation and a long note).
  { path: "/title/daredevil-2016", slug: "title-daredevil-2016" },
  // One of the two titles with a null runtime — must read as honestly empty, not "0 min".
  { path: "/title/marvel-zombies-2025", slug: "title-marvel-zombies-2025" },
  { path: "/sign-in", slug: "sign-in" },
];

// Viewport definitions: width × height
const VIEWPORTS = {
  mobile: { width: 390, height: 844, name: "mobile" },
  desktop: { width: 1440, height: 900, name: "desktop" },
};

// Ensure shots directory exists
const SHOTS_DIR = path.join(process.cwd(), "shots");
if (!fs.existsSync(SHOTS_DIR)) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

test.describe("Screenshot harness", () => {
  for (const route of ROUTES) {
    for (const viewport of Object.values(VIEWPORTS)) {
      test(`${route.slug}@${viewport.name}`, async ({ browser }) => {
        // Create a new context with the specified viewport
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();

        // Relative to baseURL in playwright.config.ts. "networkidle" is deliberately
        // not used: the dev server holds an HMR websocket open, so idle is not a
        // state this page reliably reaches.
        await page.goto(route.path, { waitUntil: "load" });

        // The type is doing real work with variable-font axes, and a shot taken
        // mid-swap is a lie about what the page looks like.
        await page.evaluate(() => document.fonts.ready);

        // Control assertion: ensure page has rendered text content
        const bodyText = await page.textContent("body");
        const trimmedText = bodyText?.trim() || "";
        expect(
          trimmedText.length > 0,
          "Harness check failed: page has no rendered text. The harness is suspect, not the page."
        ).toBe(true);

        // Take full-page screenshot
        const screenshotPath = path.join(SHOTS_DIR, `${route.slug}--${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Control assertion: verify PNG was written and has reasonable size
        // A blank page compresses to ~300-400 bytes; real content is larger
        const fileStats = fs.statSync(screenshotPath);
        const fileSizeKb = fileStats.size / 1024;
        expect(
          fileStats.size > 500,
          `Harness check failed: screenshot is suspiciously small (${fileSizeKb.toFixed(1)}KB). The harness is suspect, not the page.`
        ).toBe(true);

        await context.close();
      });
    }
  }

  // The quality floor says visible keyboard focus everywhere, tungsten, never `none`.
  // Form controls are where that gets lost: a Tailwind `outline-none` on an input sits at
  // the same specificity as the global `:focus-visible` rule, and which one wins depends
  // on cascade layers rather than on anything visible in either file. So it gets looked
  // at, not reasoned about.
  test("focus ring is visible on the sign-in fields", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto("/sign-in", { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    // Tabbed to rather than focused programmatically, because :focus-visible is exactly
    // the difference between the two. Counted in a loop rather than hardcoded: the header
    // adds a link ahead of the form, and a fixed count silently tests the wrong element.
    const focused = page.locator("input[name=email]");
    for (let i = 0; i < 8 && !(await focused.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(focused).toBeFocused();

    const outline = await focused.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor };
    });
    expect(outline.style, "focused input has no outline style").not.toBe("none");
    expect(parseFloat(outline.width), "focused input outline has no width").toBeGreaterThan(0);

    await page.screenshot({ path: path.join(SHOTS_DIR, "sign-in-focus--desktop.png") });
    await context.close();
  });
});
