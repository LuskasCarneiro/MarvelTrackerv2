# Progress — where the work stands

**Read this immediately after `CLAUDE.md`.** Newest entry first. Update it before ending
any session that changed anything, then commit and push.

---

## You are here

**Phase 0 — Foundations. In progress.**

Next action: install the Supabase and three.js dependency sets, write the design tokens,
then run the TMDB pipeline. Blocked on nothing.

### Phase status

| Phase | State |
|---|---|
| 0 — Foundations (repo, scaffold, CI, memory, deploy) | **in progress** |
| 1 — Catalogue (TMDB pipeline, 152 titles, DOM design) | not started |
| 2 — Accounts (Supabase auth, RLS, ratings) | not started |
| 3 — The shelf (three.js, material system) | not started |
| 4 — Polish (a11y, perf, SEO) | not started |

### Open items

- **⚠ Vercel is deploying `public/` as a static site and never running Next.js.**
  The one remaining fault. *Fix: Vercel → Settings → Build & Deployment →
  **Framework Preset: Other → Next.js**, clear any **Output Directory** override (it must
  be blank, not `public`), then redeploy.* Alternatively delete and re-import the project —
  auto-detection works now that the repo actually contains Next.js.

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
