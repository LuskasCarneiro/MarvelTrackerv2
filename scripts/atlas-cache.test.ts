import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import manifest from "../data/atlas.json";

const ATLAS_DIR = resolve(__dirname, "../public/atlas");

/**
 * The atlas is cached forever by `next.config.ts`, which is only safe while its filename is a
 * hash of its own bytes. Three ways that can quietly break, all of them producing a shelf
 * that renders nothing while every other test passes:
 *
 *  - the manifest names a file that is not there (404, blank room);
 *  - the file is there but its bytes no longer match its name (a stale atlas pinned in
 *    caches for a year);
 *  - a previous run's atlas is left behind and served to somebody's warm cache.
 */
describe("the cover atlas is safe to cache forever", () => {
  it("names a file that exists", () => {
    for (const name of manifest.atlases) {
      expect(existsSync(resolve(ATLAS_DIR, name)), `${name} is in the manifest but not on disk`).toBe(true);
    }
  });

  it("carries a hash of its own bytes in its name", () => {
    for (const name of manifest.atlases) {
      const digest = createHash("sha256").update(readFileSync(resolve(ATLAS_DIR, name))).digest("hex").slice(0, 8);
      expect(name, "the atlas was edited without being rebuilt").toContain(digest);
    }
  });

  it("leaves no unreferenced atlas behind", () => {
    const onDisk = readdirSync(ATLAS_DIR).filter((name) => name.endsWith(".webp"));
    expect([...onDisk].sort()).toEqual([...manifest.atlases].sort());
  });

  it("is declared immutable exactly where those files live", () => {
    const config = readFileSync(resolve(__dirname, "../next.config.ts"), "utf-8");
    expect(config).toContain("/atlas/:file*");
    expect(config).toContain("immutable");
  });
});
