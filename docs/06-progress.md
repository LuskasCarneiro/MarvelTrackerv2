# Progress — where the work stands

**Read this immediately after `CLAUDE.md`.** Newest entry first. Update it before ending
any session that changed anything, then commit and push.

---

## You are here

**Phase 2 — Accounts. IN PROGRESS.** One thing is owed by the owner and it is blocking real
sign-ups; see immediately below.

### ✅ Resolved 2026-08-11 — the redirect allow-list, and the one it now excludes

The owner fixed it in the dashboard. Re-measured by asking the auth server rather than
reading the settings page:

| `redirect_to` | before | now |
|---|---|---|
| `https://marvel-trackerv2.vercel.app/auth/confirm` | blocked | **allowed** |
| `http://localhost:3000/auth/confirm` | allowed | **blocked** |
| `https://evil.example.com/steal` | blocked | blocked |

Production works. **Local development sign-up now does not** — `http://localhost:3000/**`
came off the list when production went on. Both belong there. It costs nothing to add back
and it will otherwise waste somebody's afternoon in a future session, because the failure
looks like broken code rather than a setting.

**Still true:** Supabase's built-in email sender is rate limited to a few messages an hour
and is meant for development. Public sign-up is a settled decision, so custom SMTP is needed
before this is announced anywhere. Not a code change.

**Still unverified by anyone:** the full sign up → confirm → sign in → rate path, end to
end, against production. It is now *possible*, which it was not before, but it needs a real
mailbox and a human.

### What is done and verified

- **Auth works and the catalogue stayed static.** `/` and all 152 `/title/[slug]` pages are
  still prerendered — confirmed from the build route table, not assumed. Auth state is read
  only in Client Components; the one server-side Supabase client exists for the email
  confirmation route and nothing else.
- **Vercel env vars confirmed present** — not by asking, but by loading the deployed
  `/sign-in` in a real browser and finding the Supabase endpoint inlined in the client
  bundle, with no console errors. This had been an open item since Phase 0.
- **RLS is proved, not claimed.** `npm run test:rls` runs the real policies against a real
  Postgres in CI on every push. See `docs/04-auth-and-rls.md`.
- **Anon is denied at the grant level on production**, not merely filtered: `SELECT`,
  `INSERT` and `DELETE` as the publishable key all return `42501 insufficient_privilege`.
- **Migrations apply from CI**, from secrets that live in GitHub and on no laptop.

---

## Phase 1 — complete

Nothing is blocked. Nothing is owed by the owner.

The design system, the screenshot harness, the v1 extraction and CI are all done, verified
and committed. What remains in Phase 1 is the TMDB metadata join, the UK English
translations, and then the catalogue and detail pages built on top of both.

**The catalogue is built.** `/` is the shelf wall (five eras, 152 spines, width encodes
runtime) and `/title/[slug]` is the back of the case, all 152 prerendered at build.

**Phase 1 is complete.** Catalogue, detail pages, real artwork and real per-title palettes
are all in and deployed.

**Next action — Phase 2, accounts.** Supabase auth, RLS, rate/watch/log.

1. **Before starting, confirm the two Vercel env vars are actually set** in the dashboard:
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Nothing else is
   needed there. This has been an open item since Phase 0 and has never been verified from
   this machine.
2. Migrations are unblocked: `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` are already
   GitHub Actions secrets, so CI applies them and no credential sits locally.
3. **Private shelves are enforced by Row Level Security, not by application code.** That is
   the settled decision and the reason there is no service-role key anywhere. Any subagent
   touching auth or RLS gets sonnet, never haiku, and gets reviewed.

**Still open, not blocking:**

- **The steelbook era does not read as bright, and the design doc used to claim it did.**
  Light ink cannot sit on a light spine at 4.6:1, so the contrast loop pulls all 50
  steelbook titles from a table lightness of 50 down to a mean of 41.9 — barely above
  bluray's 40.3. The era survives via saturation rather than lightness. Measured, recorded
  in `docs/02-design-system.md`, and the doc's false claim corrected. **The fix is Phase 4
  work:** pick the ink per spine by contrast instead of always printing label-bright, which
  is also more faithful to a real steelbook (dark ink on bright metal). Needs a pipeline
  re-run and `artwork.test.ts` re-pointed at whichever ink a spine uses.

- **The 3D spike was offered and never answered.** Render one Amaray case with real cover
  art to prove procedural geometry is good enough before Phase 3 is funded. The artwork
  pass has now produced exactly the assets it needs, so this is the cheap moment.
- `data/tmdb-match-report.md` if a match is ever in doubt — sorted worst-confidence-first.
  33 are `fuzzy` and nearly all are benign: TMDB prefixes many series with "Marvel's", and
  the source abbreviates several film titles (*Shang-Chi*, *Quantumania*).

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
| 1 — Catalogue (TMDB pipeline, 152 titles, DOM design, artwork) | **complete** |
| 2 — Accounts (Supabase auth, RLS, ratings) | **in progress** — blocked on the owner for the redirect allow-list |
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

### 2026-08-10 — Phase 2 begun: accounts

Orchestrated as before — sonnet for the work that touches auth, and the security boundary
itself written and reviewed rather than delegated.

**Two Next 16 breaking changes that would have silently broken the standard Supabase setup.**
Every `@supabase/ssr` guide in circulation tells you to create `middleware.ts`. In Next 16
that file is **deprecated and renamed to `proxy.ts`**, and `cookies()` is async. Found by
reading `node_modules/next/dist/docs/01-app/` first, as `AGENTS.md` insists. **We have
neither file**, which is the right answer for a different reason: a proxy exists to refresh
tokens for server-side session reads, nothing here reads the session server-side, and the
browser client refreshes its own. Do not add one back by reflex.

**The architecture is shaped by keeping the catalogue static.** One `await cookies()` in a
layout or page would turn all 152 prerendered pages dynamic and throw away Phase 1. So auth
state is read only in Client Components, and `src/lib/supabase/server.ts` has exactly one
caller: the email confirmation route. **Check the build route table after touching this** —
`○ /` and `● /title/...` mean it still holds.

**The redirect allow-list only knew about localhost** — see the top of this file. Worth
recording as a *class* of fault rather than an incident: settings that name an environment
(redirect URLs, CORS origins, CSP, webhook targets) are written on day one against
`localhost`, live in a dashboard where no diff will ever show them to you, and fail only for
people who are not you. The way to check is to ask the service rather than read the
dashboard — three candidate URLs including a deliberately hostile one, ten lines, no extra
credentials. The hostile one is what distinguishes "the list is wrong" from "the list is
empty".

**RLS is tested against a real Postgres, and the test was proved able to fail.** It passed
first time, which is exactly when to be suspicious — so the read policy was replaced with
`using (true)` and the test re-run. It failed with `another user's shelf is readable — saw 2
rows` and exit code 3. A test only ever seen passing has not been shown to test anything.
The generalisable version is in the second brain as
*A guard that has never failed is not yet a guard*.

What that test covers that a hand-check would miss: **a blocked `UPDATE` under RLS is not an
error.** It matches zero rows and returns success, so a missing policy looks exactly like a
working feature. Same for the case that needs `UPDATE` to carry both `USING` and
`WITH CHECK` — moving one of your own rows onto someone else's shelf.

**Left as an observation, not chased further:** in `next dev` the overlay shows a red
"1 Issue" badge on every route, including Phase 1 pages it predates. `devIndicators: false`
does not suppress it — the docs say plainly that errors are still surfaced. Ruled out:
browser console in dev (clean), browser console in production (clean), the dev server
terminal (clean), `next build`, `tsc --noEmit`, `eslint`, and all 48 unit tests. Production
serves no overlay at all. Every cheap channel is exhausted; if it turns out to matter it
will resurface with more to go on.

**Ratings landed, and reviewing the subagent's output caught two things worth recording.**

1. **"Still static" is not the same as "still cheap".** Making the shelf interactive by
   putting `"use client"` on `src/app/page.tsx` kept the route table saying `○` — a Client
   Component page prerenders fine — while quietly pulling the whole catalogue join into the
   browser: 710 KB → 847 KB of JS, 510 KB → 550 KB transferred. `page.tsx` is a Server
   Component again and `ShelfWall` gets only the four fields a spine draws with. Back to
   511 KB with the feature kept. **Prop or import, it still ships** — passing whole `Title`
   objects as props would have cost the same, because props are serialised into the RSC
   payload. Two checks after touching that page now, not one.
2. **The rating control was correct and looked unfinished**, which is only visible in a
   render. Ten real radio inputs sat next to the stars as a row of bright white dots,
   louder than the stars they duplicated. The radios are now `sr-only` — still real inputs,
   so arrow keys, selection-follows-focus and announcement stay the browser's job — with
   the focus ring moved onto the star group via `has-[:focus-visible]`, because `sr-only`
   clips an element to a pixel and the global ring would land somewhere invisible.
   Confirmed by tabbing to it and reading back `outline: 2px solid rgb(232,169,78)`.

   Making the radios real also introduced a bug worth knowing about: **in a radio group
   selection follows focus**, so one held arrow key passes through every step in between —
   nine writes to get from half a star to five. Rating writes are debounced 400 ms, and the
   pending write is *flushed* on unmount rather than cancelled, because losing a rating
   silently is worse than saving it slowly.

**A screenshot check earned its place again**, this time for keyboard focus: a Tailwind
`outline-none` on an input sits at *the same specificity* as the global `:focus-visible`
rule, so which one wins depends on cascade layers rather than on anything visible in either
file. Unlayered rules beat layered ones, so the ring survives — but that is a conclusion
worth a test rather than an argument, and `e2e/screenshots.spec.ts` now tabs to the field
and asserts a real outline.

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

**`chrono` was missed by that pass entirely** and reached the rendered page as
"CHRONOLOGY: multiverso" on 17 of 152 titles. My briefing named the notes and the universe
names and never mentioned it. Found by looking at a screenshot, not by any test — the
guard now sweeps *every* user-facing string rather than the one field that broke. The
translation lives in `notes-en.json` under `chrono`, because `titles.json` holds the facts
and `notes-en.json` holds the English copy layer; the split is worth keeping.

Two heuristics in that guard were wrong before they were right, and both are the same
mistake: `"anos "` matched **Th*anos***, and substring matching generally finds Portuguese
inside English words. It uses word boundaries now. **A guard that cries wolf gets
disabled**, so a false positive is not a harmless cost.

#### The catalogue pages are built, and the screenshots earned their keep again

`/` is the shelf wall; `/title/[slug]` is the back of a video case. All 152 prerender.

Three faults looked fine as code and wrong as pixels:

1. **Spine tint at 12%** — the design doc's ratio for tinted *chrome*. A spine is not
   chrome; it stands in for the artwork and is the only thing distinguishing neighbours, so
   a shelf rendered as identical dark bars. Raising it exposed the real fault: the
   placeholder palette ran at 50–65% saturation across the full hue wheel and produced an
   **arbitrary rainbow that could have belonged to any subject**. Now 14–26% saturation —
   varied but dusty, like printed card under one lamp. Lightness carries the era instead.
2. **The page was capped at a reading measure**, hiding two thirds of the catalogue behind
   a horizontal scrollbar on a 1440px screen — the one thing the layout exists to avoid.
3. **Four identical "Agents of S.H.I.E.L.D." spines** side by side. 19 titles repeat and
   that show appears seven times, so the series number is now part of the printed name, as
   on a real boxset spine.

#### The artwork pass — palettes are real now

Every title takes its hue from its own poster, extracted at build time. Both Hulk films
come out green, Iron Man red, Captain America the sepia of its 1940s one-sheet. The
hash placeholder survives only as the fallback for three unreleased titles with no art.

**Images are not committed.** They come from `image.tmdb.org`, which needs no API key, via
`next/image` with a tightly scoped `remotePatterns` entry. Committing ~450 files to get
what a public CDN already serves is weight without benefit. Committed instead:
`data/artwork.json` — chosen paths plus the conditioned palette, because colour extraction
needs the pixels and must not run on the client. *Phase 3 differs* — the shelf needs packed
KTX2/Basis atlases, which are genuine build artifacts.

Two faults found by checking the output rather than reading the report, both fixed at
source so a re-run stays correct (0 contrast failures and 0 near-grey extractions, from 4
of each):

1. **The near-grey filter tested HSL saturation**, which has a blind spot at both ends of
   the lightness range: `#E3E6EB` is 3% chroma — plainly a grey — but reports **17% HSL
   saturation**, because HSL divides by proximity to mid-grey. Four titles took their hue
   from noise. Filtering on **chroma** (max − min channel) has no such blind spot.
2. **The contrast floor sat exactly on 4.5**, and four titles landed at 4.49–4.50 when
   recomputed from the rounded `hsl()` string rather than the float. The floor is 4.6 now.
   **Do not sit on a boundary you care about** — a percent of lightness buys the entire
   class of dispute. The test asserts the real 4.5, not the margin, so retuning the margin
   later does not break it.

#### Two faults of my own, recorded because they are the instructive kind

- **I committed a file that broke `next build`.** `scripts/data.test.ts` had ten
  implicit-any errors. I verified it with `npm test` and **vitest does not typecheck**, so
  the build stayed broken across two commits until a subagent ran the right command. The
  lesson is not "run more commands" — it is that *the tool you verify with has to be the
  tool that would catch the fault*, and I picked one that structurally could not.
- **The `chrono` gap above.** A briefing that lists specific fields will be followed
  literally, and everything unlisted goes untranslated in silence.

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
