# Progress — where the work stands

**Read this immediately after `CLAUDE.md`.** Newest entry first. Update it before ending
any session that changed anything, then commit and push.

---

## You are here

**Phase 1 — Catalogue. IN PROGRESS.** Nothing is blocked. Nothing is owed by the owner.

The design system, the screenshot harness, the v1 extraction and CI are all done, verified
and committed. What remains in Phase 1 is the TMDB metadata join, the UK English
translations, and then the catalogue and detail pages built on top of both.

**Next action:**

1. **Artwork pass — the main remaining Phase 1 job.** Posters, backdrops, transparent
   title logos, palette extraction, procedural spine composites. Deliberately deferred
   until the matches were audited, so nothing expensive got built on a wrong id.
   `sharp` 0.35.3 is already present transitively via Next, so palette extraction needs no
   new dependency — promote it to an explicit devDependency when that work starts.
   Until then the catalogue derives a deterministic tint per title from its slug.
2. Re-read `data/tmdb-match-report.md` if any match is ever in doubt. It is sorted
   worst-confidence-first. 33 records are `fuzzy`, and the great majority are benign —
   TMDB prefixes many series with "Marvel's", and the source abbreviates several film
   titles (*Shang-Chi*, *Quantumania*, *Multiverse of Madness*). Those are correct.
3. Phase 2 (Supabase auth + RLS) is unblocked whenever you want it.

**Before writing any App Router code, read `node_modules/next/dist/docs/01-app/`.**
Next 16 has breaking changes and its own `AGENTS.md` says so. Confirmed this session:
`params` is a Promise and must be awaited; `PageProps<'/route'>` and `LayoutProps<'/route'>`
are global helpers needing no import; Cache Components are opt-in via
`cacheComponents: true` and we do **not** enable them — the catalogue is committed JSON
read at module scope, which prerenders automatically as a "predictable value".

### Phase status

| Phase | State |
|---|---|
| 0 — Foundations (repo, scaffold, memory, deploy) | **complete** |
| 1 — Catalogue (TMDB pipeline, 152 titles, DOM design) | **in progress** |
| 2 — Accounts (Supabase auth, RLS, ratings) | not started |
| 3 — The shelf (three.js, material system) | not started |
| 4 — Polish (a11y, perf, SEO) | not started |

### Corrections to earlier handovers — read these before trusting an old note

- **Phase 0 was recorded as complete "including CI". There was no CI.** No workflows, no
  `test` script. Added this session: `.github/workflows/ci.yml` running lint, test and
  build on push and PR to `main`, with no secrets. Phase 0's row above no longer claims CI.
- **`docs/PLAN.md` §2's medium table cannot be implemented as written** — its year ranges
  overlap (2006 in both DVD and Blu-ray, 2013 in both Blu-ray and steelbook, 2019 in both
  steelbook and none). The disambiguated ranges are in `docs/02-design-system.md` and are
  what the pipeline uses. Do not "correct" them back to the PLAN table.
- **three.js and Supabase were deliberately not installed.** The earlier note said to pin
  them now to keep the lockfile in one commit; that is a weak reason to carry two phases of
  unused dependencies and their security surface, and they will be outdated by the time
  Phase 3 needs them. Only `vitest` and `@playwright/test` went in.

### Open items

- **✅ RESOLVED 2026-08-09 — Vercel was deploying `public/` as a static site.** Fixed by
  setting Framework Preset to Next.js. https://marvel-trackerv2.vercel.app now returns 200
  with `x-nextjs-prerender: 1` and `x-matched-path: /`. Kept below because the *diagnosis*
  is reusable, not because anything is outstanding.

  **Cause:** the Vercel project was created while the repo held only the `HelloWorld` blob,
  so no framework was detected and the preset stuck.

  **How it was proved**, so nobody re-debugs it: every one of the five files in `public/`
  (`next.svg`, `vercel.svg`, `globe.svg`, `window.svg`, `file.svg`) returns 200 at the site
  *root*, while `/public/next.svg`, `/README.md`, `/package.json` and `/` all return 404.
  The site root **is** the `public/` directory. Builds report `success` because a static
  copy has nothing to fail.

  **Two diagnostic traps recorded because I fell into both:**
  1. `x-vercel-error: NOT_FOUND` does **not** mean the domain is unassigned. An attached
     domain serving a deployment that has no `/` route returns exactly the same thing.
     `marvel-trackerv2.vercel.app` was correctly attached the whole time — confirmed by
     `GET /next.svg` → 200 on it. An earlier entry here claimed it was unassigned; that was
     wrong.
  2. A green GitHub deployment status means *Vercel finished*, not *the app works*. All
     four deployments reported `success` while serving nothing.

  Local `npm run build` passes clean (compiles, typechecks, `/` prerendered static), so
  nothing here is a code fault. Do not go looking for one.

- **Resolved 2026-08-09:** Deployment Protection removed (production no longer 302s to
  `vercel.com/sso-api`), and `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` are set as
  GitHub Actions secrets — so CI can apply migrations.

- **Migrations need a way to reach Supabase.** No secret key or access token on this
  machine, and that is deliberate. Either the owner pastes the generated SQL into the
  Supabase SQL editor once, or adds `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` as
  GitHub Actions secrets so CI applies migrations and no credential sits locally.
- **Vercel env vars:** confirm `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set in the Vercel dashboard. Nothing else is
  needed there — TMDB is build-time only and its output is committed.
- **The 152 curated notes are in European Portuguese** and the product is UK English. They
  are hand-written and genuinely good, so they get **translated with care, not
  regenerated**. Source: `~/Desktop/marvel-vault/index.html`, the `films` and `seriesItems`
  arrays.
- **3D spike not yet run.** Offered to the owner: render one Amaray case with real cover
  art to prove procedural geometry is good enough before Phase 3 is funded. Not yet
  approved or declined.

---

## Log

### 2026-08-09 — Phase 1 begun

Orchestrated: Opus planning and reviewing, subagents doing the work on the smallest model
that fit. Haiku for the mechanical jobs (extraction, harness, CI), sonnet for the two that
need judgement (TMDB matching, translation).

- **Design system authored and committed.** `src/app/globals.css` is the source of truth;
  `docs/02-design-system.md` holds only what CSS cannot say. Six fixed colours plus a
  per-title `--tint`; tungsten is treated as a light source, not a brand accent.
- **Archivo and Newsreader are loaded with explicit `axes`.** `next/font` ships `wght` only
  unless extra axes are named, so without `axes: ['wdth']` every compressed spine label
  silently renders at normal width — it compiles, it typechecks, and it just looks wrong.
  Verified against `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`:
  Archivo carries `wdth` 62–125, Newsreader carries `opsz` 6–72.
- **The screenshot harness was built before the visual work, and immediately earned it.**
  Three defects that were invisible in the code and obvious in the render: the page was
  white (the scaffold `page.tsx` hard-codes `bg-zinc-50`/`bg-white` over the body token);
  then spine labels overlapped their neighbours (in vertical writing the line box runs
  horizontally, so the default `line-height` makes the text wider than the spine); then
  labels were clipped unreadable because a physically accurate 7% width:height spine ratio
  is too thin to set 10px type in. The ratio is now deliberately exaggerated, and that is
  recorded as a legibility decision someone can disagree with.
- **v1 extraction done and verified**: 82 films + 70 series, all 152 notes confirmed
  byte-for-byte against `~/Desktop/marvel-vault/index.html`, no duplicate titles (so title
  is a safe join key). Universe `color`/`cx`/`cy` dropped as dead data.
- **CI added**, and the design doc's contrast claim made true rather than asserted. Five
  pairs at 16.0, 10.1, 5.0, 4.7 and 9.2 — the checker parses the hex out of `globals.css`
  rather than keeping its own copy, and agrees with an independent hand calculation.
- **TMDB credentials verified working** (both v3 key and v4 bearer). Values never printed.
- Reviewed and fixed three defects in subagent output rather than taking the reports at
  face value: the Playwright spec hardcoded a port the config never set and waited on
  `networkidle` (which a dev server holding an HMR socket never reaches), and the extractor
  hardcoded absolute paths including a username.

**Known tidy-up, not urgent:** `package.json` has no `"type": "module"`, so Node and Vite
both warn that `.ts` files using ESM syntax are being reparsed. Everything passes; it was
left alone because two agents were writing scripts at the time and changing the module type
mid-flight is how you get a confusing failure.

#### The catalogue is joined to TMDB, and three matches were silently wrong

152 records: 84 exact, 33 fuzzy, 35 hand-checked overrides, **0 unresolved**. Two runtimes
are `null` and stay null — *Marvel Zombies* and *X-Men '97* S2 are unreleased, and an
invented number would be worse than an honest gap.

Auditing the matches caught three wrong ones, **and none of them failed loudly**:

| Ours | Had matched | Actually |
|---|---|---|
| Agents of S.H.I.E.L.D. S3–S6 | `69088` | *Slingshot*, a 6-episode webseries → `1403` |
| What If…? S2–S3 | `235614` | an unrelated 2024 show called *What If* → `91363` |
| Runaways S3 | `116521` | a different *Runaways* from 2012 → `67466` |

**Why none of them errored, which is the part worth remembering:** each wrong show was a
real show that happened to have a season with the number being asked for — one of them a
season 3 containing zero episodes. So the lookup returned a season, the runtime summed to
nothing, and the field came out `null`. A null runtime reads as *missing upstream data*,
not as *wrong programme entirely*. The matcher's own confidence score did not catch the
Runaways case at all; it rated it the same as the ones it got right.

What caught all three was one structural question: **a show cannot be two different TMDB
ids.** `scripts/data.test.ts` now asserts that, plus season-uniqueness per id, and all
three shows are pinned season by season in `data/tmdb-overrides.json` so a re-run cannot
drift back. The generalisable version is in the second brain as
*A plausible wrong match fails silently*.

**Audit the nulls.** Sorting them into "expected" and "unexplained" is five minutes and
pointed straight at the fault: 9 nulls before the fix, 2 after, and the 2 are legitimate.

#### The notes are translated, not regenerated

All 152, verified: no missing keys, no invented ones, no leftover Portuguese, and
**zero sentence-count drift** — that last check is the rewrite guard, since a "better"
sentence than the owner's is the failure mode here, not a worse one. Portuguese character
and property names are restored to their English forms. Universe labels translated too.

One flagged note was a false positive worth recording so nobody re-fixes it: `" de "` in
*Thunderbolts\** is the nobiliary particle in **Valentina Allegra de Fontaine**, which keeps
its "de" in English. The test now strips name particles before looking for Portuguese.

### 2026-08-09 — Phase 0 begun

- Owner settled the four open decisions: **UK English**, **public sign-up with rate
  limiting**, **private shelves**, and **design authority delegated to Claude**.
- Credentials supplied in `.env`: TMDB v3 key + v4 read token, Supabase URL + publishable
  key. Verified present by name; values never printed.
- Vercel already deploying from `main` → https://marvel-trackerv2.vercel.app
- Local folder attached to `origin/main`; the placeholder `HelloWorld` blob removed.
- Scaffolded **Next.js 16.3.0** / React 19.2.8 / Tailwind v4 / TypeScript strict.
  *The plan said Next 15; reality is 16, which has breaking changes. Its own `AGENTS.md`
  warns that its APIs differ from training data — read `node_modules/next/dist/docs/01-app/`
  before writing App Router code.*
- `.gitignore` written **before** the first commit. Verified with `git add --dry-run` that
  `.env` is blocked and `.env.example` is staged. (`git check-ignore -v` is misleading here:
  it exits 0 even when the matching rule is a negation — trust the dry-run instead.)
- Renamed TMDB vars from TMDB's dashboard labels (`API_KEY`, `API_READ_ACCESS_TOKEN`) to
  `TMDB_API_KEY` / `TMDB_READ_TOKEN`.
- Wrote `CLAUDE.md` project memory and this file.

### 2026-08-06 — Plan approved

- Took apart `press.stripe.com` rather than guessing: it is **three.js**, driven by a
  per-book JSON material block embedded in the HTML, using **`MeshPhongMaterial` with
  shader injection** (not PBR — `shininess` gives it away), with two bump layers, a foil
  map and geometry thickness carrying page count. Full teardown in `docs/PLAN.md` §1.
- Concept settled: the archive as a shelf of home-video releases that ages by era.
- Considered and **rejected generative AI for product assets** (Higgsfield and similar):
  the shelf needs seamlessly tiling textures with split normal/roughness channels and an
  equirectangular HDRI — format mismatches, not quality gaps. Poly Haven / ambientCG give
  those as CC0 for free. See `docs/PLAN.md` §6.
