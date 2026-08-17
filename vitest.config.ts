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
    //
    // Both patterns are anchored the way they are for a reason:
    //
    // - `**/e2e/**` rather than `e2e/**`, which only ever matched the top-level
    //   directory. Any checkout nested below the root brought its own copy of the
    //   Playwright specs back into the run, where they fail on import.
    // - `.claude/**` is where EnterWorktree puts git worktrees. Without it every
    //   worktree on this machine contributes a *second* copy of every unit test to
    //   `npm test` — so the suite grows as worktrees accumulate, re-runs the same
    //   assertions, and reports failures from a tree you are not working in. Two
    //   stale worktrees were enough to turn a green suite red: 43 test files
    //   instead of 14, four of them failing, none of it the project's fault.
    exclude: [...configDefaults.exclude, '**/e2e/**', '.claude/**'],
  },
});
