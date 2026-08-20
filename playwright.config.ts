import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  /**
   * The budget, stated once for every spec.
   *
   * These tests drive a WebGL room through **software rasterisation** — a room of cabinets,
   * 152 textured covers and three glTF models to decode before the first frame. Playwright's
   * 30s default was written for pages, not renderers, and every time something was added to
   * the scene a different spec started failing as a timeout. That failure reads as flake, or
   * worse as a real fault: one of them looked exactly like picking being broken. Setting it
   * here, high and once, is honest; nudging a per-test timeout each time is how you stop
   * noticing that the scene got slower.
   */
  timeout: 180_000,
  use: {
    // Specs navigate to relative paths so the port lives in exactly one place.
    baseURL: "http://localhost:3000",
    trace: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
