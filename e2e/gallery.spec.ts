import { test, expect } from "@playwright/test";

/**
 * The locked-off gallery's two new ways in: search, and swiping between bays.
 *
 * Both are only testable in a real browser — search resolves a title to a bay and a position
 * inside it and then drives a WebGL frame loop, and the swipe is a pointer gesture with an
 * axis lock. Vitest can see the matcher (search.test.ts) and nothing else about either.
 */
test.describe("the gallery", () => {
  test("search summons a title from another bay", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/shelf", { waitUntil: "load" });
    await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });

    const bay = page.locator("span.font-display").first();
    await expect(bay).toHaveText("MCU", { timeout: 30_000 });

    // Logan is an X-Men title, so a correct jump has to change bay as well as position.
    await page.getByLabel("Search the archive").fill("logan");
    await page.getByRole("button", { name: "Find" }).click();

    await expect(bay).not.toHaveText("MCU", { timeout: 15_000 });
    // The caption is two lines: the title, then year and format. Assert on the title itself —
    // the second line would pass for any 2017 steelbook, which is not what is being claimed.
    await expect(page.getByText("Logan", { exact: true })).toBeVisible({ timeout: 15_000 });
    expect(errors, "the page threw while searching").toEqual([]);
  });

  test("says so when nothing matches, rather than pulling out the wrong case", async ({ page }) => {
    await page.goto("/shelf", { waitUntil: "load" });
    await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });

    const bay = page.locator("span.font-display").first();
    await expect(bay).toHaveText("MCU", { timeout: 30_000 });

    await page.getByLabel("Search the archive").fill("zzzzzzzz");
    await page.getByRole("button", { name: "Find" }).click();

    // The dangerous failure is a bad match silently presenting the wrong title, so assert both
    // that it says nothing matched *and* that it did not move.
    await expect(page.getByText("Nothing matches that.")).toBeVisible();
    await expect(bay).toHaveText("MCU");
  });

  test("a sideways drag moves to the next bay", async ({ page }) => {
    await page.goto("/shelf", { waitUntil: "load" });
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 60_000 });

    const bay = page.locator("span.font-display").first();
    await expect(bay).toHaveText("MCU", { timeout: 30_000 });

    const box = (await canvas.boundingBox())!;
    const y = box.y + box.height * 0.5;
    await page.mouse.move(box.x + box.width * 0.7, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 14 });
    await page.mouse.up();

    await expect(bay).not.toHaveText("MCU", { timeout: 15_000 });
  });
});
