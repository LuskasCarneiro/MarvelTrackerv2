import { describe, expect, it } from "vitest";
import { storyYear } from "./chronology";
import { titles } from "./catalogue";

describe("storyYear", () => {
  it("takes a bare year as itself", () => {
    expect(storyYear("2008")).toBe(2008);
  });

  it("takes the start of a range, not its end", () => {
    expect(storyYear("1942–1945")).toBe(1942);
    expect(storyYear("2016–2017")).toBe(2016);
  });

  it("takes the earlier of a pair, however it is written", () => {
    expect(storyYear("1944 and 1962")).toBe(1944);
    expect(storyYear("1973 (and 2023)")).toBe(1973);
  });

  it("reads the year out of a phrase", () => {
    expect(storyYear("Christmas 2013")).toBe(2013);
    expect(storyYear("c. 2004")).toBe(2004);
    expect(storyYear("2026 (multiverse)")).toBe(2026);
  });

  it("reads a decade as its first year", () => {
    expect(storyYear("the 1980s")).toBe(1980);
    expect(storyYear("retro 1960s")).toBe(1960);
    expect(storyYear("c. 2010s")).toBe(2010);
  });

  // The trap: the plain-year rule would find 2024 in "5000 BC – 2024" and file Eternals with
  // the present day — losing the one title that opens the whole story order.
  it("puts a BC year before the common era, not at the end of its range", () => {
    expect(storyYear("5000 BC – 2024")).toBe(-5000);
    expect(storyYear("1845 to the 1980s")).toBe(1845);
  });

  it("resolves the five relative ones from their reference title", () => {
    expect(storyYear("after Daredevil")).toBe(2004);
    expect(storyYear("shortly after X3")).toBe(2007);
    expect(storyYear("just after Civil War")).toBe(2016);
    expect(storyYear("shortly before the Snap")).toBe(2018);
    expect(storyYear("years after the first")).toBe(2011);
  });

  // The whole point of the story ordering: these must stay unplaceable. A fallback year here
  // would quietly file Loki and What If…? on the timeline, which is the one thing
  // docs/05-3d-shelf.md §5 says not to do.
  it("refuses to place a title that has no place on a line", () => {
    for (const unplaceable of ["multiverse", "outside time", "its own reality", "several centuries", "various eras", "ambiguous", "—"]) {
      expect(storyYear(unplaceable), unplaceable).toBeNull();
    }
  });
});

describe("the catalogue's own chronology", () => {
  const placed = titles.filter((t) => t.storyYear !== null);
  const floating = titles.filter((t) => t.storyYear === null);

  it("places all but the 14 that belong outside time", () => {
    expect(titles).toHaveLength(152);
    expect(floating).toHaveLength(14);
    expect(placed).toHaveLength(138);
  });

  it("opens the story order 5000 BC and ends it in the present", () => {
    const years = placed.map((t) => t.storyYear!).sort((a, b) => a - b);
    expect(years[0]).toBe(-5000);
    expect(years[years.length - 1]).toBeGreaterThanOrEqual(2025);
  });

  it("floats exactly the titles about unstable reality, by name", () => {
    // Named rather than counted: a parser change that floated a different 14 would keep the
    // count and silently break the idea.
    const names = [...new Set(floating.map((t) => t.title))].sort();
    expect(names).toEqual([
      "Across the Spider-Verse",
      "Agents of S.H.I.E.L.D.",
      "Eyes of Wakanda",
      "Into the Spider-Verse",
      "Legion",
      "Loki",
      "Marvel Zombies",
      "What If...?",
      "Your Friendly Neighborhood Spider-Man",
    ]);
  });
});
