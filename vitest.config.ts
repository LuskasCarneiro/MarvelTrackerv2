import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/ belongs to Playwright (npm run shots), not Vitest — its specs use
    // @playwright/test and would fail here.
    //
    // This is spread onto configDefaults.exclude rather than passed as a CLI
    // --exclude, because the CLI flag *replaces* the defaults instead of adding
    // to them, which quietly drops node_modules from the exclusion list.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
