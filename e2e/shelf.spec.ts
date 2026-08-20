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
/**
 * Bring the controls back before touching one.
 *
 * The chrome hides itself when nothing is happening (docs/05-3d-shelf.md §12 Q4) and is
 * `pointer-events: none` while hidden, so a click aimed at a control lands on the canvas
 * behind it instead — which Playwright reports as "canvas intercepts pointer events" and
 * looks like a z-index bug. A real user's pointer is already moving when they reach for a
 * button; this is that move, made explicit.
 */
async function wakeChrome(page: import("@playwright/test").Page) {
  // **Focus, not hover.** `focus()` needs no hit-test, so it works while the chrome is still
  // faded and `pointer-events: none`; `hover()` and `mouse.move()` both have to win a race
  // against the 2.6s linger, which under software GL they lose about a third of the time.
  //
  // Focusing a control inside the bar also *pins* it open (`onFocusCapture` → holdChrome), so
  // nothing later in the test can be caught by the fade. And it is a real user path rather
  // than a test-only backdoor: it is exactly the keyboard reveal of §12 Q11.
  await page.getByRole("button", { name: "Release order" }).focus();
  await expect(page.locator("html")).toHaveAttribute("data-chrome", "shown");
}

test.describe("the shelf", () => {
  test("renders the room and opens the case you click", async ({ page }) => {
    // Software GL plus a room's worth of geometry: under the whole suite this overruns the
    // 30s default, and the overrun reads as a picking failure rather than as the budget.
    test.slow();
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
    //
    // Where the run sits in frame is a function of the camera framing, and the framing is
    // tuned. A single hard-coded point re-breaks this every time the shelf moves up or down a
    // few percent — which is a test failing for being out of date rather than for finding a
    // fault. So walk down the middle and take the first point that actually hits a case.
    const box = (await canvas.boundingBox())!;
    // A small grid rather than one column: the room is entered from the middle now, so the
    // horizontal centre of the frame is often bare wall between two cabinets. Sweeping both
    // axes keeps this a test of "clicking a case opens that case" rather than a test of where
    // the furniture happened to sit on the day it was written.
    // Six points, not a dense grid: each miss costs its own wait, and twenty-eight of them
    // overran the test budget and failed as a timeout — which reads as "picking is broken"
    // when picking was fine. Aimed at where cabinets actually stand: the back wall, and both
    // side walls near the frame edges.
    const points = [
      [0.45, 0.45],
      [0.45, 0.32],
      [0.12, 0.3],
      [0.88, 0.3],
      [0.2, 0.38],
      [0.8, 0.38],
    ] as const;
    for (const [fx, fy] of points) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      const opened = await page
        .waitForURL(/\/title\/[a-z0-9-]+$/, { timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
      if (opened) break;
    }
    await expect(page, "no click anywhere on the canvas hit a case").toHaveURL(
      /\/title\/[a-z0-9-]+$/
    );
    await expect(page.locator("h1")).toBeVisible();
  });

  test("moves between universes, and swaps the objects in story order", async ({ page }) => {
    await page.goto("/shelf", { waitUntil: "load" });
    await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });

    await wakeChrome(page);
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

  test("turns a case over to show its back, and puts it back", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto("/shelf", { waitUntil: "load" });
    await expect(page.locator("canvas")).toBeVisible({ timeout: 60_000 });

    // The caption names whatever is out of the shelf, and carries the turn control.
    await wakeChrome(page);
    const turn = page.getByRole("button", { name: "Turn it over" });
    await expect(turn).toBeVisible({ timeout: 30_000 });
    await expect(turn).toHaveAttribute("aria-pressed", "false");

    await turn.click();
    const back = page.getByRole("button", { name: "Turn it back" });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("aria-pressed", "true");

    // Drawing the back is where a canvas texture is built from the title's own data — the one
    // step in this interaction that can throw on a real page and cannot throw in vitest.
    expect(errors, "the page threw while printing the back of the case").toEqual([]);

    // Walking away puts it back rather than dragging a turned case along the shelf.
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 300);
    await expect(page.getByRole("button", { name: "Turn it over" })).toBeVisible({ timeout: 10_000 });
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
