/**
 * Frame-time measurement for /shelf, on real hardware.
 *
 * Every performance number in this repo so far came from headless software GL (SwiftShader),
 * which is a comparator and not the truth. This runs a *headed* Chromium on the machine's
 * actual X display so it gets the real GPU, and it REFUSES to report a number if it finds
 * itself on a software rasteriser anyway -- a measurement you cannot attribute to a renderer
 * is worse than no measurement, because it looks like data.
 *
 * Usage: node measure-frames.mjs <url> [label]
 */
import { chromium } from "@playwright/test";

const url = process.argv[2];
const label = process.argv[3] ?? url;
if (!url) {
  console.error("usage: node measure-frames.mjs <url> [label]");
  process.exit(2);
}

// Matches the screenshot harness so frames and timings describe the same picture.
const VIEWPORT = { width: 1440, height: 900 };
const SAMPLE_MS = 6000;

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const browser = await chromium.launch({
  headless: false,
  args: [
    "--window-position=0,0",
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    // Do NOT pass --use-gl=swiftshader or --disable-gpu. We want whatever the machine gives a
    // normal user, which is the entire point of this run.
  ],
});

const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

console.log(`\n=== ${label} ===`);
console.log(`viewport ${VIEWPORT.width}x${VIEWPORT.height} @1x`);

await page.goto(url, { waitUntil: "load", timeout: 120_000 });

// --- Which renderer are we actually on? Answer this before anything else. ---
const gpu = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") ?? c.getContext("webgl");
  if (!gl) return { ok: false, reason: "no webgl context" };
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    ok: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    version: gl.getParameter(gl.VERSION),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    dpr: window.devicePixelRatio,
  };
});

if (!gpu.ok) {
  console.error(`FAILED: ${gpu.reason}`);
  await browser.close();
  process.exit(1);
}

console.log(`renderer : ${gpu.renderer}`);
console.log(`vendor   : ${gpu.vendor}`);
console.log(`gl       : ${gpu.version}`);
console.log(`dpr      : ${gpu.dpr}   max texture: ${gpu.maxTexture}`);

const software = /swiftshader|llvmpipe|software|angle \(google/i.test(gpu.renderer);
if (software) {
  console.error(
    `\nREFUSING TO REPORT: this is a software rasteriser (${gpu.renderer}).\n` +
      `That is the same proxy every existing number came from. Fix the GPU path first.`
  );
  await browser.close();
  process.exit(3);
}

// --- Wait for the scene on its own signal, not a sleep. ---
await page.locator("canvas").waitFor({ state: "visible", timeout: 60_000 });
const t0 = Date.now();
await page
  .getByText(/Building the shelf/)
  .waitFor({ state: "hidden", timeout: 120_000 })
  .catch(() => {});
await page.getByText(/click to open/).waitFor({ state: "visible", timeout: 60_000 });
const readyMs = Date.now() - t0;
console.log(`\nscene ready in ${(readyMs / 1000).toFixed(1)}s after load`);

/** Collect rAF periods for a window, then reduce. */
async function sample(ms, what) {
  const deltas = await page.evaluate(
    (dur) =>
      new Promise((resolve) => {
        const out = [];
        let last = performance.now();
        const start = last;
        const tick = (now) => {
          out.push(now - last);
          last = now;
          if (now - start < dur) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms
  );
  // First frame straddles the call boundary; drop it.
  const d = deltas.slice(1).sort((a, b) => a - b);
  if (d.length < 5) {
    console.log(`${what.padEnd(22)} only ${d.length} frames - tab likely throttled, ignore`);
    return null;
  }
  const p50 = pct(d, 0.5);
  const p95 = pct(d, 0.95);
  const worst = d[d.length - 1];
  console.log(
    `${what.padEnd(22)} p50 ${p50.toFixed(1).padStart(6)}ms (${(1000 / p50).toFixed(0).padStart(3)}fps)   ` +
      `p95 ${p95.toFixed(1).padStart(6)}ms (${(1000 / p95).toFixed(0).padStart(3)}fps)   ` +
      `worst ${worst.toFixed(0)}ms   n=${d.length}`
  );
  return { p50, p95, worst, n: d.length };
}

console.log("");
const rest = await sample(SAMPLE_MS, "at rest");

// Presented: a case pulled out. Same title the screenshot harness uses.
await page.getByLabel("Search the archive").fill("logan");
await page.getByRole("button", { name: "Find" }).click();
await page.getByText("Logan", { exact: true }).waitFor({ timeout: 30_000 });
const presented = await sample(SAMPLE_MS, "holding a case");

// Wide: the whole bookcase, the heaviest frame there is.
await page.getByRole("button", { name: "Whole shelf" }).click();
await page.getByRole("button", { name: "Close up" }).waitFor({ timeout: 15_000 });
const wide = await sample(SAMPLE_MS, "wide (whole shelf)");

if (errors.length) console.log(`\nscene errors: ${errors.length}\n  ${errors.join("\n  ")}`);

console.log("");
await browser.close();

// One line a future session can diff against.
const line = (r) => (r ? `${r.p50.toFixed(1)}/${r.p95.toFixed(1)}` : "n/a");
console.log(
  `SUMMARY ${label} | renderer=${gpu.renderer} | ready=${(readyMs / 1000).toFixed(1)}s | ` +
    `rest=${line(rest)} held=${line(presented)} wide=${line(wide)} (p50/p95 ms)`
);
