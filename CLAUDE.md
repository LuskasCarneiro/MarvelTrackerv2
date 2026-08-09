@AGENTS.md

# Marvel Tracker v2 — project context

**Read this file first, every session. Then read `docs/06-progress.md` to find out where
the work actually stands.** Those two files are written so a cold session can resume
without re-deriving anything.

A public, multi-user archive of every Marvel film and series, presented as a shelf of
**home-video releases rendered in 3D** — where the physical object encodes the data.
Successor to `~/Desktop/marvel-vault` (v1, a zero-build single-file app). v2 is a real
production application: framework, database, accounts, CI, deployment.

| | |
|---|---|
| Local | `~/Desktop/marvel-tracker-v2` |
| Repo | https://github.com/LuskasCarneiro/MarvelTrackerv2 (public) |
| Live | https://marvel-trackerv2.vercel.app |
| Deploys | Vercel, automatically from `main` |
| Owner | LuskasCarneiro |

## Standing rules — these override defaults

1. **Never list Claude/AI as a commit author, co-author or contributor.** Standing across
   all of this owner's projects. No `Co-Authored-By`, no "Generated with" trailers.
2. **All user-facing copy is UK English.** (v1 was European Portuguese; v2 is not. The 152
   curated notes are being translated, not regenerated — see `docs/03-data-pipeline.md`.)
3. **Update the Obsidian second brain whenever there's a transferable lesson, then push it.**
   `~/Desktop/LuskasSecondBrain`. Write the *generalisable engineering lesson*, not project
   status. Owner asked for this explicitly and it is easy to forget.
4. **Session end:** update `docs/06-progress.md`, commit, push.
5. **Record failed approaches** in the relevant doc so a future session doesn't re-walk them.
6. **Secrets never enter git or the transcript.** `.env` is gitignored (verified with
   `git add --dry-run`); `.env.example` is committed with empty values. When inspecting env,
   print key *names* only.

## Stack — actual installed versions, not assumptions

| Layer | Version |
|---|---|
| Next.js | **16.3.0** (App Router) |
| React | 19.2.8 |
| Tailwind CSS | v4 (PostCSS plugin, CSS-first config) |
| TypeScript | 5.x, strict |
| Node | 22.22.0 |

> **Next.js 16 is not the Next.js in your training data.** `AGENTS.md` (imported above) says
> so explicitly. **Read `node_modules/next/dist/docs/01-app/` before writing App Router
> code** — routing, caching and async APIs all changed. This applies to subagents too; put
> it in their prompt.

Planned, not yet installed: `three` + `@react-three/fiber` + `@react-three/drei` (the
shelf), `@supabase/supabase-js` + `@supabase/ssr` (auth), `vitest`, `playwright`.

## Environment

`.env` (gitignored) holds, by name only:

```
TMDB_API_KEY                          TMDB v3 key      — build-time only
TMDB_READ_TOKEN                       TMDB v4 JWT      — build-time only
NEXT_PUBLIC_SUPABASE_URL              public by design
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  public by design (new-style sb_publishable_…)
```

**Vercel only needs the two `NEXT_PUBLIC_SUPABASE_*` vars.** TMDB is build-time only and
its output is committed as JSON, so the TMDB keys never need to leave this machine.

**Known gap:** no Supabase secret/service-role key, and no Supabase access token. Not
needed at runtime — private shelves are enforced by Row Level Security, so the app talks to
Postgres as the signed-in user, never as an admin. Applying migrations needs either the
owner pasting SQL into the Supabase SQL editor once, or `SUPABASE_ACCESS_TOKEN` +
`SUPABASE_DB_PASSWORD` as **GitHub Actions secrets** (preferred: CI holds them, not me).

## Product decisions — settled, do not relitigate

| Decision | Value | Settled |
|---|---|---|
| Language | UK English | owner, 2026-08-09 |
| Sign-up | **Public**, with rate limiting and abuse protections | owner, 2026-08-09 |
| Shelves | **Private** — nobody can see another user's ratings | owner, 2026-08-09 |
| Design authority | **Claude decides**, using design skills + subagents | owner, 2026-08-09 |
| Palette | Dark, warm; no fixed accent — each title tints from its own artwork | Claude |
| Generative AI assets | **Not used for product assets** — see `docs/PLAN.md` §6 | 2026-08-06 |

## The concept in one line

The archive is a shelf of home-video releases, and **the shelf physically ages as you move
through it** — VHS clamshell → DVD Amaray → Blu-ray → steelbook → no physical release.
Thickness encodes runtime. Foil encodes the title treatment. Nothing is labelled; you just
feel it. Full reasoning, including how `press.stripe.com` actually works (three.js +
`MeshPhongMaterial` with shader injection, per-book JSON materials), is in `docs/PLAN.md`.

## Docs

| File | Holds |
|---|---|
| `docs/PLAN.md` | The approved plan. Concept, reference teardown, phasing, asset sources. |
| `docs/06-progress.md` | **Where the work stands. Read this second, always.** |
| `docs/02-design-system.md` | Tokens' reasoning, the shelf layout, medium eras, motion budget. |
| `docs/03-data-pipeline.md` | The three scripts, the join keys, the TMDB traps, palette conditioning. |

Docs still to be written as their phases begin: `01-architecture`, `04-auth-and-rls`,
`05-3d-shelf`, `07-open-questions`, `adr/`.

**Two corrections to `PLAN.md`, both load-bearing:**

1. **§2's medium table has overlapping year ranges** (2006, 2013 and 2019 each appear in
   two rows) and cannot be implemented as written. `docs/02-design-system.md` holds the
   disambiguated ranges and the pipeline uses those.
2. **§4 says Next.js 15.** It is **16.3.0**, which has breaking changes.

## Lessons inherited from v1 — do not re-learn these

- **You cannot review by eye what you only read as code.** v1 hand-drew the Iron Man mask
  eight times because it reasoned about CSS instead of looking at renders. Build the
  screenshot/frame harness *before* the visual work, and actually look at the output.
- **Real assets beat generated stand-ins** for anything that must look real.
- **Generated geometry belongs to a generator**, not to hand-edited markup. The script is
  the source; the committed output is a build artifact.
- **Two identical markers is a landmine** — a splice script matched the wrong one of two
  identical comments and silently duplicated 180 lines.
- **Check contrast in CI.** v1 shipped 2.7:1 body text once.
- **Headless screenshots don't composite modal layers** — run a control before believing a
  visual failure is real.
