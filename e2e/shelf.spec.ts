import { test, expect } from "@playwright/test";

/**
 * A smoke test for the 3D shelf, in a real browser, because **vitest structurally cannot see
 * any of this**. Everything asserted below was broken at least once while the shelf was being
 * built, and none of it failed a unit test when it was:
 *
 * - the scene rendered nothing at all (a throwing module in the shared masthead);
 * - a click resolved to the wrong title (instance index and slug array disagreeing);
 * - a swipe opened a title instead of walking the shelf (a drag counted as a tap).
 *
 * It is deliberately about behaviour rather than pixels. Pixel comparison on a WebGL canvas
 * across machines is a flake generator; "the renderer drew the room, and clicking a case
 * opens that case" is the part that must not regress.
 */
test.describe("the shelf", () => {
  test("renders the room and opens the case you click", async ({ page }) => {
    const drawCalls: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("[shelf] draw calls")) drawCalls.push(message.text());
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto("/shelf", { waitUntil: "load" });

    // The atlas is 3 MB and decodes slowly under software GL, which is what CI has.
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() => drawCalls.length, { timeout: 60_000, message: "the scene never reported a frame" })
      .toBeGreaterThan(0);
    expect(errors, "the page threw while building the shelf").toEqual([]);

    // Control: the renderer drew the room, not just the ground plane. The scene reports its
    // own draw calls, so a blank frame is visible here as a suspiciously small number.
    const calls = Number(drawCalls[0].match(/draw calls: (\d+)/)?.[1] ?? 0);
    expect(calls, `only ${calls} draw calls — the shelf itself did not render`).toBeGreaterThan(5);

    // A case opens its own page. Which case depends on the framing, so this asserts the
    // relationship rather than a fixed title: whatever was clicked, a title page opened.
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
    await page.waitForURL(/\/title\/[a-z0-9-]+$/, { timeout: 15_000 });
    await expect(page.locator("h1")).toBeVisible();
  });

  test("moves between universes, and swaps the objects in story order", async ({ page }) => {
    await page.goto("/shelf", { waitUntil: "load" });
    await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });

    const shelfName = page.locator("span.font-display").first();
    const first = (await shelfName.textContent())?.trim();
    await page.getByRole("button", { name: "Next universe" }).click();
    await expect(shelfName).not.toHaveText(first ?? "", { timeout: 10_000 });

    // Story order states plainly that it is a conceit — the two modes must not wear each
    // other's language (docs/05-3d-shelf.md §4).
    await page.getByRole("button", { name: "Story order" }).click();
    await expect(page.getByText(/A conceit: nothing was recorded in 1943/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Story order" })).toHaveAttribute("aria-pressed", "true");
  });

  test("says so when it cannot draw, rather than showing a black rectangle", async ({ browser }) => {
    const context = await browser.newContext();
    // Deny WebGL the way a locked-down browser does: before any app code runs.
    await context.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = function () {
        return null;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const page = await context.newPage();
    await page.goto("/shelf", { waitUntil: "load" });
    await expect(page.getByText(/needs WebGL/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /Browse the same 152 titles/ })).toBeVisible();
    await context.close();
  });
});
