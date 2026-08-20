# The room — approved plan, 2026-08-20

**Settled with the owner by interview, against a reference image they supplied
(`artistic_dir.jpg`, repo root).** Twenty-four decisions. Where the owner overruled a
recommendation of mine it is marked, because a cold session that disagrees needs to know it
was already argued and lost.

This supersedes `docs/05-3d-shelf.md` §12's room and layout decisions. §12's *object* decisions
— spine-out, thickness encoding, the format mark, the pull-out motion — still stand.

## The reference, and what we take from it

A private collector's library: three walls of floor-to-ceiling mahogany joinery with brass
inlay, brass-framed engraved nameplates under individual picture lights, a central arched
alcove of spotlit niches, coffered ceiling, leather furniture, plank floor and a rug.

Its nameplates are near-identical to what we already built — brass, engraved caps, one per
universe — and its section labels match ours ("FOX's X-Men & Fantastic Four", "MCU", "Vintage
& Classic Marvel"). That part is confirmation, not new work.

**What we take:** the enclosure, the joinery language, the brass, the layered warm light, the
mixed face-out/spine-out display, the central arch.
**What we do not:** the dark shell (see Q2), the statues and furniture (deferred — see
`docs/08-future-developments.md`).

## The decisions

### Scope and shell

| # | Decision | |
|---|---|---|
| Q1 | Build **(a) the material and lighting language, (b) the enclosure, (c) the joinery detail**. Furniture and focal props are deferred to the end of the project and only on the owner's word | |
| Q2 | **Light walls, ceiling and floor; dark mahogany cabinets.** Not the reference's dark shell | *owner overruled: I argued to go fully dark* |
| Q18 | Pale oak plank floor, stepped cornice rather than full coffering, a rug | |
| Q21 | **Every cabinet is full height with one continuous cornice line.** What varies is how much is *open shelf* versus *closed cupboard door* below | *owner corrected me: I had proposed short cabinets with bare wall above* |

> **Q2 reverses a decision made the previous day** and reverses it only halfway. The room was
> painted warm off-white on 2026-08-19 at the owner's request ("a light color like you would
> see in a normal wall"). The reference is emphatically dark. The owner chose to keep the light
> *shell* and take the dark *joinery* — which is a better answer than either source: pale
> plaster makes the cabinets read as objects instead of dissolving into a dark room. **The
> chrome re-inking stays as it is** (`globals.css`, `[data-chrome] .shelf-chrome`), because the
> walls behind it are unchanged.

### The enclosure and the camera

| # | Decision | |
|---|---|---|
| Q3 | **Three walls, camera inside the room** | |
| Q6 | **Rotation on rails.** Fixed scripted positions per bay; no user-controlled orbit | |
| Q19 | ← → and search move you *between* universes and the camera flies to that bay; scroll walks titles *within* the bay. Back/escape returns to the centre view | |

> **Q6 amends a rule written into `ShelfScene.tsx`**: *"it does not orbit, it does not pan, and
> it never rotates"*, with an OrbitControls rig deleted rather than disabled so nobody would
> re-enable it. Rotation on rails honours what that rule protected — no two things fighting
> over one camera, no user-controlled orbit — while letting the camera face a side wall. **Do
> not read this as permission to add OrbitControls.**

You arrive at the centre of the room seeing all three walls. Choosing a universe moves you to
its wall and squares you to it.

### The massing

**Derived from measurement, not taste.** Face-out costs ~140mm per title against ~11mm
spine-out — about thirteen times hungrier — so the display mode is what decides whether a room
of this size looks full or abandoned. Measured face-out requirement per universe:

| | titles | face-out | open levels |
|---|---|---|---|
| **MCU** | 57 | 8.0 m | **2 bays, 4 open** — back wall |
| Vintage | 14 | 1.96 m | 2 open |
| Netflix | 13 | 1.82 m | 2 open |
| X-Men (Fox) | 13 | 1.82 m | 2 open |
| Sony | 11 | 1.54 m | 1–2 open |
| ABC | 10 | 1.40 m | 1–2 open |
| Animation | 10 | 1.40 m | 1–2 open |
| Hulu | 9 | 1.26 m | 1–2 open |
| Classic era | 5 | 0.70 m | 1 open |
| Fantastic Four | 3 | 0.42 m | 1 open |
| Spider-Verse | 2 | 0.28 m | 1 open |

**Total 21.3 m face-out against 1.6 m spine-out.** Back wall: MCU's two bays flanking the
central arch. Side walls: the remaining eleven, split roughly five and six.

Open shelving sits at the **top** of each cabinet so it lands at eye level; cupboard doors fill
below. **The amount of open shelf encodes the size of the collection** — the MCU is open almost
to the floor, Spider-Verse is one lit shelf over a run of doors. Nothing looks broken and the
cornice stays level all the way round.

### Display

| # | Decision | |
|---|---|---|
| Q4 / Q12 | **Adaptive.** Shelves that would read empty get face-out covers; the owner gave me liberty over the arrangement, and said a little free space is fine. Target ~80% full | |
| Q10 | **The whole spine is the title's hero colour**, with the ink chosen for contrast against it — not the near-black it is now | *owner's own idea* |
| Q13 | **Drop the head tint band** (the whole spine now does that job); **keep the format foot band** with a thin dark keyline so it reads on any hero colour | |
| Q22 | Face-out cases get a **brass shelf-edge label** carrying the era colour — the museum convention, and readable at the distance you actually stand | |
| Q12 (c) | **Framed cover art** on the walls, brass-framed. Costs nothing: we already have all 152 images, and a frame is a plane plus four boxes | |

> **Q10 overturns a written palette rule.** `docs/02-design-system.md` and `CLAUDE.md` both say
> the covers are the only colour in the room. A wall of hero-coloured spines is a great deal of
> colour. **Amend the rule, do not quietly contradict it.** It also solves a real problem: at
> the distance this room needs, spine *type* is a few pixels and unreadable, but colour reads
> perfectly — the shelf becomes a mosaic that tells you where you are.
>
> Ink colour must be **measured, not eyeballed**: pick black or white per tint by luminance and
> hold the project's 4.5:1 floor. `scripts/contrast.test.ts` guards DOM colour, not texture, so
> this needs its own check.

### Lighting

| # | Decision | |
|---|---|---|
| Q9 | **Two or three real lights; everything else emissive.** Brass picture-light strips that *glow* without lighting anything cost nothing and are what the eye actually reads | |
| Q24 | **All four brass details** — shelf edges, nameplate frames, pilasters, door inlay — built in that order so we can stop when it looks right | |

Real lights are charged against every lit fragment. The current scene runs one shadow-casting
room light, one spotlight and two ambient terms at a comfortable 16.7ms. Measure before adding
a third (`scripts/measure-frames.mjs`).

### The arch, and the favourite

| # | Decision | |
|---|---|---|
| Q8 | The pull-out stays as it is — the case comes to the viewer, unchanged | *owner overruled: I proposed it travel to the arch* |
| Q14 | **The arch survives** as the room's focal point, holding a featured title face-on and spotlit | |
| Q23 | **A favourite button decides what stands in the arch.** One favourite at a time — selecting another clears the previous | *owner's own idea* |
| Q25 | The button lives on the **title page** only, beside the existing rating | *owner overruled: I argued for the shelf caption too* |
| Q26 | Stored **the same way ratings are** — Supabase `entries`, read client-side | |
| Q27 | Before anything is favourited, and for signed-out visitors: **the first Iron Man** | |

**The migration applies itself.** `.github/workflows/migrate.yml` runs `supabase db push` on
any change under `supabase/migrations/**` pushed to `main`, and both `SUPABASE_ACCESS_TOKEN`
and `SUPABASE_DB_PASSWORD` are already set as repository secrets — **verified 2026-08-20**.

> **`CLAUDE.md` is stale on this.** It says "Known gap: no Supabase secret/service-role key,
> and no Supabase access token… Applying migrations needs either the owner pasting SQL… or
> [the secrets] as GitHub Actions secrets (preferred)". The preferred route is already in
> place. Correct that paragraph.

"Only one at a time" is a constraint the database should enforce, not hopeful client code: a
`favourite` flag on `entries` with a **partial unique index per user**, so a second favourite
is rejected by Postgres.

### Fillers — delegated

The owner gave me full liberty here (Q20), having ruled out Marvel props (Q16). The rule I am
working to: **fill with the archive's own vocabulary, never borrowed IP.**

- **Film cans and Super-8 reels** — geometry we already build for story order, period-correct,
  free.
- **Cases lying flat in short stacks** — what every real shelf has, and what stops it looking
  merchandised.
- **Brass bookends** closing a short row.
- **Framed cover art**, on walls and standing on shelves.

## Build order — staged merges (Q28)

Each stage merges to `main` on its own, so the live site stays coherent and the owner keeps
reacting to real frames. That feedback loop has caught more than the tests have.

1. **Shell and cabinets.** Three walls, light shell, dark mahogany carcasses at full height
   with the open/closed split, cornice, plinth, floor, ceiling, rug. Camera on rails. Nameplates
   carried over.
2. **Display.** Face-out grids and spine-out rows with the adaptive fill; hero-colour spines;
   brass shelf-edge era labels; framed cover art.
3. **The arch and the favourite.** Niche and featured title; favourite button on the title page;
   the migration.
4. **Fillers and the rest of the brass.** Cans, reels, stacks, bookends; pilasters; door inlay.

**Measure on real hardware at the end of every stage.** Every performance number this repo
recorded before 2026-08-19 came from software rasterisation and was wrong by roughly thirty
times; three separate decisions were taken on the strength of it.

## Amendments this plan requires elsewhere

1. **`CLAUDE.md`** — the palette line (Q10 puts colour on every spine) and the stale migration
   gap paragraph.
2. **`docs/02-design-system.md`** — the per-title tint is now the whole spine, not a band; the
   head band is gone and the format band gains a keyline.
3. **`docs/05-3d-shelf.md` §12** — its room and camera decisions are superseded; its object
   decisions are not.

## Deferred

`docs/08-future-developments.md`. **Only on the owner's word, and at the end of the project.**
