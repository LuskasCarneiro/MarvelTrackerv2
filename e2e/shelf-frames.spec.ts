import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import sharp from "sharp";

/**
 * Frames of the 3D shelf, one per state worth looking at.
 *
 * `screenshots.spec.ts` covers the flat pages; the shelf was never in its route list, so the
 * one part of this app that cannot be reviewed by reading its source was the one part the
 * screenshot harness did not point at. That is v1's most expensive lesson (`CLAUDE.md`), and
 * it had been re-made here.
 *
 * One test, four states, because they are sequential — you cannot turn a case that is not
 * presented — and because the software-GL warm-up costs seconds that there is no reason to
 * pay four times.
 */

const SHOTS_DIR = path.join(process.cwd(), "shots");
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

/**
 * A WebGL frame that failed to draw is not a small file — a black 1440×900 PNG and a lit
 * gallery can land within a few KB of each other once compressed, so size proves nothing
 * here. Tonal spread does: a frame that drew has a range of values, a frame that did not is
 * flat. Checked per channel, since a scene that lost its textures but kept its lights would
 * still have luminance spread while collapsing towards grey.
 */
async function expectDrawn(file: string) {
  const { channels } = await sharp(file).stats();
  const spread = Math.max(...channels.map((c) => c.stdev));
  expect(
    spread,
    `Harness check failed: ${path.basename(file)} is tonally flat (max channel stdev ${spread.toFixed(2)}). ` +
      `The frame did not draw — suspect the harness before the scene.`
  ).toBeGreaterThan(8);
}

test.describe("shelf frames", () => {
  // Software GL needs a long warm-up, and under the whole suite it overruns Playwright's 30s
  // default. That failure reads as flake and is nothing of the kind — it is the budget.
  test.slow();

  test("captures the four states worth looking at", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/shelf", { waitUntil: "load" });
    await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });

    // The atlas is 3 MB and the room is empty until it lands. The scene says so itself, so
    // wait on its own signal rather than on a sleep that is either flaky or wasteful.
    await expect(page.getByText(/Building the shelf/)).toBeHidden({ timeout: 90_000 });
    // Proves the frame loop has actually run and named a title, which is strictly later than
    // the canvas existing — and is what the pointer and keyboard handlers are bound behind.
    await expect(page.getByText(/click to open/)).toBeVisible({ timeout: 30_000 });

    const shoot = async (slug: string) => {
      const file = path.join(SHOTS_DIR, `shelf-${slug}.png`);
      await page.screenshot({ path: file });
      await expectDrawn(file);
    };

    // 1. At rest: the shelf as you arrive, nothing in your hands.
    await shoot("rest");

    // 2. Presented: a case pulled off the shelf and held. Logan is an X-Men title, so this
    //    also moves bay — the frame shows the travel, not just the pull.
    await page.getByLabel("Search the archive").fill("logan");
    await page.getByRole("button", { name: "Find" }).click();
    await expect(page.getByText("Logan", { exact: true })).toBeVisible({ timeout: 30_000 });
    await shoot("presented");

    // 3. Turned: the back cover, carrying the curated note. Driven by the button rather than
    //    a click at guessed canvas coordinates — the case moves, the button does not.
    await page.getByRole("button", { name: "Turn it over" }).click();
    await expect(page.getByRole("button", { name: "Turn it back" })).toBeVisible({ timeout: 15_000 });
    await shoot("turned");

    // 4. Wide: standing back to take in the whole bookcase. Put the case away first, so this
    //    frame is about the architecture and not about what is in your hands.
    await page.getByRole("button", { name: "Turn it back" }).click();
    await page.getByRole("button", { name: "Whole shelf" }).click();
    await expect(page.getByRole("button", { name: "Close up" })).toBeVisible({ timeout: 15_000 });
    await shoot("wide");

    expect(errors, "the scene threw while being photographed").toEqual([]);
  });
});
