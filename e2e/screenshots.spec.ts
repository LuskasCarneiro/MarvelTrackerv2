import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

// Route list: add new routes here as they're created
const ROUTES = [
  {
    path: "/",
    slug: "home",
  },
  // Example: { path: "/title/iron-man", slug: "title-iron-man" }
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
});
