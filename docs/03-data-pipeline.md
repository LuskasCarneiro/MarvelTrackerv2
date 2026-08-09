# Data pipeline

Three scripts turn the v1 single-file app plus TMDB into the committed JSON the site reads.
**The generator is the source; the JSON is a build artifact** — same discipline as v1's
generated SVG. Do not hand-edit the outputs.

```
~/Desktop/marvel-vault/index.html
        │  scripts/extract-v1.ts          (no network)
        ▼
data/v1-source.json ──────────────────────────────┐
        │                                         │
        │  scripts/build-data.ts   (TMDB metadata)│  translation, by hand + subagent
        ▼                                         ▼
data/titles.json                          data/notes-en.json
        │  scripts/build-artwork.ts  (TMDB images + palette)
        ▼
data/artwork.json
```

All four outputs are committed. The site imports them at module scope, which Next 16
treats as a *predictable value* and prerenders automatically — **no `use cache`, no Cache
Components, no runtime API calls.**

## Running them

```bash
node --experimental-strip-types scripts/extract-v1.ts                 # no credentials
node --env-file=.env --experimental-strip-types scripts/build-data.ts     # ~152 API calls
node --env-file=.env --experimental-strip-types scripts/build-artwork.ts  # ~152 API calls + poster downloads
```

Node 22 strips TypeScript natively — there is no ts-node or tsx here and none is wanted.
Credentials come from `--env-file=.env`; there is no `dotenv` dependency.

**`build-data.ts` and `build-artwork.ts` overwrite audited files.** Do not run them
casually. `data/titles.json` in particular had three wrong matches found and fixed by hand
(below), and those fixes survive a re-run *only* because they were written into
`data/tmdb-overrides.json`. If you re-run, diff the result before committing.

## The four data files

| File | Holds | Joins on |
|---|---|---|
| `v1-source.json` | 82 films + 70 series as v1 wrote them, Portuguese notes intact | — |
| `titles.json` | the **facts**: slug, year, runtime, medium, tmdbId, season | `slug` |
| `notes-en.json` | the **English copy layer**: notes, universe labels, chronology phrases | original title string |
| `artwork.json` | TMDB image paths + the conditioned palette | `slug` |

**The facts/copy split is deliberate.** `titles.json` is what the pipeline derived;
`notes-en.json` is what a human wrote or translated. Keeping them apart means a pipeline
re-run cannot destroy translation work, and it is why `chrono` translations live in
`notes-en.json` rather than being patched into the facts file.

**Titles are unique across all 152**, verified — which is what makes a flat title→note map
safe. If a future title ever collides, that join breaks silently, so
`scripts/catalogue.test.ts` asserts every title resolves to a non-empty note.

## Matching against TMDB

### The mechanism

Search on a cleaned title plus year, score candidates on normalised title equality and year
proximity, and record a `matchConfidence` of `exact` | `fuzzy` | `override`. Current split:
**84 exact, 33 fuzzy, 35 override, 0 unresolved.**

Titles need cleaning before searching: v1 disambiguates with parentheses
(`The Punisher (1989)`) and marks seasons with a suffix (`Daredevil S2`). Both are stripped
for the search and kept as the join key.

`data/tmdb-overrides.json` maps our exact title string to an explicit id, and optionally a
season or `tmdbType`. **It is the mechanism, not a fallback** — anything ambiguous belongs
there, hand-checked by fetching the id and reading back its title and year.

### Fuzzy is usually fine

33 records are `fuzzy` and nearly all are benign in two ways:

- TMDB prefixes many series with the studio: *Marvel's Jessica Jones*, *Marvel's Runaways*.
- v1 abbreviates several films: *Shang-Chi*, *Quantumania*, *Multiverse of Madness*,
  *Into the Spider-Verse*.

`data/tmdb-match-report.md` is sorted worst-confidence-first and flags every row where the
matched title differs or the year is off. Read it before trusting a match.

### The three wrong matches — recorded so nobody re-walks this

| Ours | Had matched | Actually |
|---|---|---|
| Agents of S.H.I.E.L.D. S3–S6 | `69088` | *…: Slingshot*, a 6-episode webseries → `1403` |
| What If…? S2–S3 | `235614` | an unrelated 2024 show called *What If* → `91363` |
| Runaways S3 | `116521` | a different *Runaways* from 2012 → `67466` |

**None of them failed loudly, and that is the lesson.** Each wrong show was a real show
that happened to have a season with the number being requested — one of them a season 3
containing zero episodes. The lookup succeeded, the runtime summed to nothing, and the
field came out `null`. A null runtime reads as *missing upstream data*, not as *wrong
programme entirely*.

The confidence score did not catch Runaways at all: it scored the same as the matches it
got right, and its own runner-up was the correct answer.

**What caught all three was a structural invariant, not a score: a show cannot be two
different TMDB ids.** `scripts/data.test.ts` asserts that, plus season-uniqueness per id.
All three shows are now pinned season by season so a re-run cannot drift back.

**Audit the nulls.** Sorting `runtimeMin: null` into *expected* and *unexplained* took five
minutes and pointed straight at the fault: 9 nulls before, 2 after, and the 2 remaining are
genuinely unreleased titles. A null is never left to mean "probably fine".

## The medium rule

Derived from release year **by rule**, never verified per title:

| medium | years |
|---|---|
| `vhs` | ≤ 1996 |
| `amaray` | 1997 – 2005 |
| `bluray` | 2006 – 2012 |
| `steel` | 2013 – 2018 |
| `none` | ≥ 2019 |

> **`docs/PLAN.md` §2's version of this table cannot be implemented** — its ranges overlap
> at 2006, 2013 and 2019. These are the disambiguated ranges. Do not "correct" them back.

The UI states once that the medium is a rule, and never implies it is a verified fact about
a specific release. Real exceptions (Blade shipped on both VHS and DVD in 1998) would be
handled by an override with a source, not by bending the rule.

## Artwork and the palette

**Images are not committed.** They are served from `image.tmdb.org`, which needs no API
key, via `next/image` with a tightly scoped `remotePatterns` entry in `next.config.ts`.
Committing ~450 files to get what a public CDN already serves is weight without benefit.
`data/artwork.json` holds the chosen paths plus the palette.

*Phase 3 will differ:* the 3D shelf needs packed KTX2/Basis atlases, which are genuine
build artifacts and will be committed. That decision does not apply to the DOM layer.

### Palette conditioning — the part that is a design decision, not a detail

Extraction takes the **hue** from the poster. Saturation and lightness come from the
**room**, per medium (see `src/lib/tint.ts`).

This is not a compromise, it is the point. "Each title tints from its own artwork" is a
settled decision, but a raw extracted colour cannot be used directly:

- The site is a dark room lit by one warm lamp. An unconditioned vivid poster colour
  destroys that, and 152 of them produce **an arbitrary rainbow that could belong to any
  subject at all**. This was observed, not theorised — see the screenshots note in
  `06-progress.md`.
- Spines carry `--color-label-bright` text. Lightness is therefore **contrast-bearing**,
  not decorative.

So hue is the per-title data; saturation and lightness are the room. Lightness also encodes
era — VHS card dullest, steelbook brightest because metal catches the lamp.

**Contrast is enforced, not assumed.** After conditioning, the ratio against `#F2EBE1` is
computed and lightness is reduced until it clears 4.5:1. `scripts/artwork.test.ts`
recomputes it independently rather than trusting the recorded number.

Extraction excludes near-black, near-white and near-grey pixels. Without that, letterboxing
and credits blocks dominate the histogram and two thirds of a catalogue comes back "dark
grey".

## Traps, recorded

- **Do not hand-write a JS parser** for the v1 file. `extract-v1.ts` slices the literal and
  evaluates it in `node:vm`. It is our own trusted local file.
- **Anchor on unique marker text**, not line numbers. v1 was bitten once by a splice script
  matching the wrong one of two identical comments and silently duplicating 180 lines.
- **`vitest` does not typecheck.** `npm test` passing does not mean `npm run build` passes;
  a file was committed with ten implicit-`any` errors that broke the build for two commits
  because it was verified with the wrong tool. Run `npx tsc --noEmit` or `npm run build`.
- **A translation brief is followed literally.** `chrono` reached the rendered page still in
  Portuguese on 17 titles because the brief named the notes and the universe labels and not
  that field. The guard now sweeps *every* user-facing string.
- **Word boundaries, not substrings**, when detecting language. `"anos "` matches
  *Th**anos***; `" de "` matches *Valentina Allegra **de** Fontaine*, which keeps its "de"
  in English. A guard that cries wolf gets disabled, so a false positive is not free.
