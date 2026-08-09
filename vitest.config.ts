import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json, so tests can import the real
    // application modules rather than re-implementing their logic.
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    // e2e/ belongs to Playwright (npm run shots), not Vitest — its specs use
    // @playwright/test and would fail here.
    //
    // This is spread onto configDefaults.exclude rather than passed as a CLI
    // --exclude, because the CLI flag *replaces* the defaults instead of adding
    // to them, which quietly drops node_modules from the exclusion list.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
