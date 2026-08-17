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

**Production sign-up works.** Measured four times across the day, ending here:

| `redirect_to` | first check | fix 1 | fix 2 | **now** |
|---|---|---|---|---|
| `marvel-trackerv2.vercel.app/**` | blocked | allowed | blocked | **allowed** |
| `localhost:3000/auth/confirm` | allowed | blocked | allowed | blocked |
| `evil.example.com/steal` | blocked | blocked | blocked | blocked |

Only one environment has ever been allowed at a time, which is the signature of Supabase's
**Site URL** — one field, also the fallback target — being swapped, rather than the
**Redirect URLs** list being appended to. Adding `http://localhost:3000/**` to that list
makes local sign-up work again without disturbing production. **Not urgent:** nothing user
facing is broken, it only bites the next person who tries the sign-up flow on a dev server.

Re-run the probe in `docs/04-auth-and-rls.md` after any change to this. It needs no
credentials beyond `.env` and answers in seconds what the dashboard page will happily let
you misread — this setting has now been "fixed" three times, and reading the page was wrong
every time.

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
| 2 — Accounts (Supabase auth, RLS, ratings) | **built and unblocked** — never run end to end by a human |
| 3 — The shelf (three.js, material system) | **complete** — a room with a floor, walls and skirting; twelve per-universe bookcases, scroll pulls a title out, pull-and-turn with a readable back carrying the curated note, printed spines, click-through, two orderings with the objects changing, both bump layers and foil, touch and reduced-motion paths, browser smoke tests in CI. Three items closed as decisions, not built — see below |
| 4 — Polish (a11y, perf, SEO) | **begun** — metadata, sitemap, robots and structured data done; a11y audit and perf not started |

### Phase 3's direction — read `docs/05-3d-shelf.md` §0 first

**Superseded 2026-08-12 by the owner: the archive is a room of bookcases, one per universe.**
`docs/05-3d-shelf.md` §0 holds the reasoning; §1's single continuous run was built, looked at,
and replaced. What survives is that **each unit still ages along its own length** — the MCU's
runs DVD → Blu-ray → steelbook → nothing-physical — so "the shelf ages as you move through it"
holds per shelf, and the archive gains a way to be browsed by universe.

Still settled from the 2026-08-11 design session: the furniture ages as a slow gradient while
the objects change in steps, the infinite feeling comes from lamp falloff rather than looping
the data, and there is a switch between release order and story chronology in which the object
itself changes — Captain America is a Blu-ray by release and a film can by story. **Both
halves of that switch are now built** (an earlier revision of this paragraph said the object
half was not; it was already in `formForStoryYear`, and the paragraph had gone stale).

Two findings worth not re-deriving:

- **The chronology data is more usable than it looks.** Of 152: 88 are a bare year, 45 are
  parseable by rule (`c. 2004`, `2013–2014`, `Christmas 2013`, `5000 BC – 2024`), 5 are
  relative to another title, and **14 have no place on a timeline at all**. All of this is
  implemented in `src/lib/chronology.ts`, written against the real strings.
- **Those 14 are the best part, not a data problem.** Both *Spider-Verse* films, *Loki*,
  *What If…?*, *Marvel Zombies*, *Legion*, *Your Friendly Neighborhood Spider-Man* — the
  titles literally *about* unstable reality. In story order they hang above their own unit
  rather than being assigned a year. **Do not "fix" them.**

### Phase 3 is complete — and three things were closed by deciding, not building

`/shelf` is a room of **twelve bookcases, one per universe**, each as tall as its collection
needs and bottom-aligned to one floor, at **20 draw calls**. Scrolling draws a title out of the
shelf and puts it back; arrows move between universes; a click opens the title's page; release
and story orders both work and change the object as well as the order; pull-and-turn is
complete, and the back of the case carries the owner's curated note; spines are printed; both of
`PLAN.md` §1's bump layers and its foil are applied; touch, reduced-motion and no-WebGL paths
exist; four browser smoke tests run in CI.

**Three remaining items were closed as decisions rather than work; a fourth, the room, was closed and then reopened by the owner and built.** Recording them here so
nobody re-opens them by reflex — each has a trigger that would justify revisiting it.

1. **KTX2/Basis for the atlas — deferred, and the reason changed after measuring.** The atlas is
   **3,073,036 bytes** of WebP, served `cache-control: public, max-age=31536000, immutable`, and
   not additionally compressed (WebP already is; gzipping it would buy nothing). So the wire
   cost is *one* cold load per user per year, not a repeat cost — that was already fixed by the
   caching work. What KTX2 would still buy is decode time and **VRAM**: a 4096² RGBA texture is
   ~64 MB resident, which is a real concern on the integrated-graphics laptop this is designed
   for. But that is a hypothesis, not a measurement, and buying it costs an encoder dependency
   plus a ~250 KB Basis transcoder shipped to every client. **Trigger:** measure resident
   texture memory and first-frame time on the actual laptop. If VRAM is the constraint, KTX2 is
   the answer and `scripts/build-atlas.ts` is one run away from it.
2. **LOD and adaptive quality — deferred, unchanged.** Same standard as above and the same
   reason it was deferred originally: not needed until measured on real hardware.
3. **~~The room gets no floor detail and no walls~~ — REVERSED by the owner, 2026-08-17.**
   I closed this on `docs/05-3d-shelf.md` §3's reasoning; the owner wanted a room and that is
   their call to make. **Built** — see the log entry below and §11. §3's *reasoning* survived
   into the build: no windows, no props, nothing standing about. Its conclusion did not.
4. **Cases stay face-out — the spine-out question is closed.** It was raised because a face-out
   shelf never shows you a spine. That premise stopped being true when the shelf moved to a
   close browsing framing: thick media show their printed spines from here, and thin ones do
   not, which encodes the medium. Spine-out plus a lamp reveal was always the expensive option,
   and it would hide the artwork Phase 1 spent real effort on.

**Still genuinely absent, and honestly so:** the per-item bump and foil are *derived from each
cover's own artwork* rather than from authored per-title maps. That is the right trade here —
§6 rules out generating art and there is none to license — but it is not the same thing Stripe
does, and a real foil mask would land only on the title treatment where ours lands on whatever
is brightest.

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

### 2026-08-12 — the atlas was being re-downloaded on every visit

Measured first, in a browser, before touching anything:

| route | transfer | largest |
|---|---|---|
| `/` | 1,352 KB | 254 KB JS chunk |
| `/shelf` | 4,898 KB | **3,001 KB atlas, `Cache-Control: public, max-age=0`** |

**Everything under `public/` is served `max-age=0` by default**, so the largest file in the
project was fetched again on every visit while every JavaScript chunk beside it was
`immutable`. That is a much better problem than the one that was on the list ("3.7 MB, where
KTX2 would earn its place") and it cost two lines rather than a toolchain.

`scripts/build-atlas.ts` now names each atlas after a hash of its own bytes
(`covers-0.f65d2826.webp`) and `next.config.ts` serves `/atlas/*` immutable. **The hash is
what makes the header honest** — a new atlas is a new URL, so it can never pin a stale one.
The scene already read the name out of `data/atlas.json`, so the renderer did not change. The
pipeline clears the directory first, or every run would leave a dead 3 MB file behind.

Measured after, the same way: **first visit 3,674 KB, second visit 2 KB.**

`scripts/atlas-cache.test.ts` guards the three ways this breaks silently — a manifest naming
a missing file, a file whose bytes no longer match its name, and a previous run's atlas left
behind — all of which produce an empty room while every other test passes.

**Still open:** the cold load is unchanged, and 1.6 MB of the remaining transfer is three.js
and R3F. KTX2 would cut the atlas itself; nothing cheap will cut the renderer.

### 2026-08-12 — a caption that failed the contrast floor, and the basics it lacked

**The shelf caption shipped at 3.16:1 for an afternoon.** It is the one piece of text in this
app with no known background — it floats over a canvas showing whatever cover art is behind
it — and its scrim was 85% opaque. Against a bright cover the dim second line fell under the
4.5 floor. The token contrast tests could not see it, and neither could a screenshot taken
over a dark poster.

Opaque now, and guarded in `scripts/contrast.test.ts` by a test that **reads the opacity out
of the component** rather than restating it. Broken on purpose first to prove the guard
works: 3.29:1 and red, then green once restored. A guard that has never failed is not yet a
guard.

Also added, both simply missing: a **skip link** (without one every page starts at the
masthead's auth link, and `/shelf` starts at a canvas that swallows the arrow keys), and a
**link from the shelf to the catalogue** — the honest accessible equivalent of a WebGL room
is not an `aria-label`, it is the same 152 titles as text, and that page already existed with
nothing pointing at it from here.

### 2026-08-17 — Pull-and-turn finished: a case you can take out, turn over and read

The top item on "What Phase 3 still owes" is done. A case comes out of the shelf, turns the
rest of the way round, and the camera walks in to it; the back is a printed card built at the
moment you turn it. `PLAN.md`'s signature interaction now exists end to end.

**The turn is a button, not a gesture, and that was the decision worth arguing about.** Scroll
already means "walk the shelf" and a click already means "open this title" — a third gesture
has to be taken from one of those two, and those two are what make the shelf navigable. A
button is also keyboard-operable and announceable for free, which a drag never is. It carries
`aria-pressed`, `T` toggles it, and Escape puts the case back.

**The back carries facts, not the note, and that is a bundle decision rather than an editorial
one.** Texturing one card from the 152 curated notes would ship all 152 into this route —
exactly the trap recorded under "Prop or import, it still ships". The card prints format,
year, runtime, universe, a line of honest small print and a barcode; the prose stays one click
away on the title page, which *is* the back of the case in the DOM. If the back ever wants the
note, fetch that one title's rather than importing the lot. `runtimeMin` and `tint` were added
to `ShelfItem` for this and cost nothing — both were already on the client.

**Two faults that only a render could have shown, in the exact shape v1 warned about.**

1. **The case turned correctly and was unreadable.** Geometrically perfect: right axis, right
   direction, right distance out of the shelf. It was also a thumbnail in the top-left corner
   of a 57-title wall, so the thing the interaction exists to let you read could not be read.
   The camera now lerps its aim and its dolly by the turn amount — the browsing framing rules
   (lean towards the case, keep clear of the shelf end) are correct for browsing and precisely
   wrong for reading one card, so they are blended out rather than kept. **An interaction can
   be geometrically correct and functionally useless**, and no unit test has an opinion on it.
2. **The card's own layout finished a quarter of the way down** and left the rest empty, because
   the rows were set at a fixed height. They are spread across the space they have now. The
   emptiness was a direct consequence of the no-synopsis decision above — a real case back
   fills that area with prose — so the facts had to grow to fill it instead.

**The turn is under CI**, in `e2e/shelf.spec.ts`: turn it, assert the control's state flips,
assert the page did not throw while printing the card (building a canvas texture from title
data is the one step here that can throw in a browser and structurally cannot in vitest), and
assert that walking away puts the case back rather than dragging it along the shelf.

**Two environment traps for anyone working in a git worktree on this repo**, both of which
cost time and neither of which is a code fault:

- **`next build` fails in a worktree with no `node_modules`.** Node resolves upward to the
  main checkout, so `eslint` and `vitest` both run happily and only Turbopack objects — it
  pins the workspace root at the nearest lockfile. A symlink does not fix it either
  (*"Symlink [project]/node_modules is invalid, it points out of the filesystem root"*). A
  hardlink copy, `cp -al ../../../node_modules node_modules`, is instant and costs no disk.
- **Every Playwright test fails in a worktree**, including ones that predate your change,
  because `.env` is gitignored and therefore absent, and the Supabase browser client throws
  in the root layout and takes every page down with it. Four failing tests where one was
  expected is an environment signal, not four regressions. Copy `.env` across; it stays
  ignored.

### 2026-08-17 — A locked-off gallery: the camera stops moving and the objects come to you

**Owner's direction, and it replaces the navigation model rather than adjusting it:** a fixed
eye-level shot inside a collector's gallery. The viewer stands still; a case slides off its
shelf into their hands, turns to show its back, and slides home.

- **The OrbitControls rig is deleted, not disabled.** Leaving it configured-off is how the next
  person re-enables it and reintroduces two things writing one camera, which is what made the
  previous build possible to get lost in.
- **The camera is on rails**: x is the centre of the bay, y is fixed eye level, z is a standing
  distance. It never rotates, and it does not track a case up and down the shelf — a locked-off
  shot does not bob.
- **Gestures, one meaning each.** Scroll walks the titles; a horizontal drag changes bay; search
  summons a title from anywhere; click opens; `T` turns. The drag locks its axis once per
  gesture rather than per event, or a diagonal flickers between the two and feels like an
  argument.
- **`search.ts`** ranks by exact → prefix → word-prefix → substring → all-words → universe, with
  punctuation stripped rather than spaced so `"shield"` finds *Agents of S.H.I.E.L.D. III*. No
  match returns nothing at all: the damaging failure here is a plausible wrong match silently
  presenting the wrong case.

**Two lighting faults, and the second is the one worth remembering.**

The case arrived black, then blew out to white. Neither was a tone-mapping problem, though it
looked exactly like one, and ACES was added chasing it (kept — it is right anyway).

**The real cause was that the hold point sat on top of the lamp.** `LAMP_Z` was 4.0 and the case
came to rest at z 3.4 — six tenths of a unit from a light of intensity 95. Two numbers, set in
different sessions for different reasons, colliding in space. Isolating it took one run with the
new light switched off, which proved the light I had just added was not the culprit. The lamp
now sits back at the shelf it lights, and the hold point is forward of it.

Also learned properly: **near lights make hotspots, far lights make illumination.** The
presentation light was first placed 1.7 units from a case 1.9 units tall, so falloff varied
enormously across the face and burned a hole through the middle of the artwork.

**Framing:** the first locked shot filled the frame with one bay edge to edge, which is a wall of
posters and no architecture. The standing distance is a *gallery* distance now — the bay, its
neighbours and the room all in shot. The case still arrives at the same apparent size either
way, because the hold point is measured back from the viewer rather than forward from the shelf.

**Not built, and the honest half of the brief that remains:** the mahogany and brass materials,
per-section museum spotlighting, and the architectural detailing that would make this read as a
*luxurious* gallery rather than a well-composed one. The interaction is there; the finish is not.
Hands were ruled out — photoreal hands need modelled, rigged assets and §6 rules out generating
them — and "photorealistic" is not reachable with MeshPhong and procedural textures, which is a
deliberate trade for running on the target laptop.

### 2026-08-17 — Getting lost on the shelf, and the second half of the stutter

The owner's follow-up: *"it's stuttering, and because you can move around the shelf and the zoom
level it becomes impossible to see the rest."* Two faults, and the second one was a design error
of mine that the first was hiding.

**You could not see the rest of the collection, and there was no way to ask.** `enableZoom` was
`false` — so the close framing was not a default, it was a cage. Worse, `enablePan` was on with
no angle limits: panning moved the orbit target while the frame loop was *also* moving it to
follow the case, two things writing one value, which is how you end up staring at an empty room
with no way back.

- **Pan is off**, and rotation is bounded in both axes. Without limits you could swing behind
  the bookcases, inside them, or under the floor — all of which read as the app breaking.
- **"Whole shelf" is a control now.** Zoom stays off the wheel, because the wheel already means
  "walk the shelf" and one gesture cannot mean two things; the way to see more is a named,
  reversible, keyboard-reachable button. It restores exactly the framing the close view
  replaced — the per-unit fit measurement was kept, not deleted — and aims at the middle of the
  unit rather than sliding along with the walk, since an overview that tracks the walk shows you
  nothing the close view did not.

**The close framing was the right call and an incomplete one.** Standing close is what made
spines readable and thickness legible; it also took away any sense of where you are in 57
titles. The fix was never to choose — it was to make the pair switchable, which is what should
have shipped in the first place.

**More of the stutter, from the same principle as before: stop paying for what cannot be seen.**
The substrate bump now applies only to the covers that earn it — steel, whose artwork is printed
onto brushed metal, and VHS, which is litho card. `substrate.ts` describes Amaray and Blu-ray as
"very fine, even micro-texture, low amplitude" and "finer and smoother still": they were paying
two extra texture fetches per fragment for something at the edge of visibility, on the two forms
that make up most of the catalogue.

**Measured, same harness throughout:** 1.8 fps when the owner reported it → 2.6 after removing
the hidden-body and plaster bumps → **2.9 close, and the wide view is no worse**. Against a 4.6
baseline that predates the room and the materials.

**Still honest about it:** this harness is software GL and none of these numbers is the owner's
machine. If it still stutters there, the next lever is `frameloop="demand"` — the scene is
completely static whenever nobody is scrolling, and it currently redraws anyway.

### 2026-08-17 — "It is very buggy": a framerate regression I shipped, measured and mostly undone

The owner reported the shelf as buggy. It was not a logic fault and there were no errors in the
console: **it was framerate**, and I had caused most of it. Static screenshots cannot show this,
which is exactly why a day of them missed it.

**Measured with a `requestAnimationFrame` counter in the real browser, bisected across the
day's commits** — same headless harness (SwiftShader, software GL) throughout, so the numbers
are comparable to each other even though none of them is anyone's real hardware:

| after | fps |
|---|---|
| before today | **4.6** |
| pull-and-turn | 4.6 |
| close framing + spines | 4.4 |
| **the substrate bump** | **2.6** |
| per-item bump and foil | 2.4 |
| **the room** | **1.8** |

**The single biggest cost was waste I had already documented and then not acted on.** The
substrate bump went on the case *body* as well as the cover — and the body's front is hidden
behind its artwork plane, which is the very reason the substrate was moved onto the cover in
the first place. three's bump chunk costs two extra texture fetches and a derivative per
fragment, and the bodies cover most of the screen. Removing it changes nothing anyone can see.

Second: **the plaster bump on the room's walls and ceiling.** Its own module calls it "almost
unfelt" and sets `bumpScale` to 0.006 to keep it that way, so it was paying full fragment cost
across two screen-filling surfaces for something deliberately at the edge of perception.

Those two removals: **1.8 → 2.6 fps**, a 44% recovery, with no visual change at all.

**Also found, and worse in its way: the lamp was blowing the nearest covers out to white.** I
raised `LAMP_INTENSITY` from 95 to 130 to light the room; a lamp bright enough to reach the
floor is bright enough to destroy the case standing next to it, and the artwork is the one
thing in this scene that has to survive. Back to 95 — the room is lit by `LAMP_REACH` and the
ambient term instead, which change how far the light carries rather than how hard it hits what
is closest. **Found by looking at an interaction screenshot, not by any test.**

**Adaptive quality is now built**, which the docs had deferred "until measured on real
hardware". The measurement exists now, and the key insight is one this harness structurally
cannot show: the scene is fragment-bound, and **fragment count scales with the square of the
device pixel ratio**. A HiDPI laptop at dpr 1.5 does 2.25× the work of this harness at dpr 1 —
which is both the hardware most likely to be struggling and the hardware that cannot be
measured from here. `PerformanceMonitor` now trades resolution for frames, clamped to the
screen's own ratio so it never asks a dpr-1 display to render at 1.1, with `flipflops` to stop
it oscillating.

**Left honestly unresolved:** even the baseline was 4.6 fps in this harness, so the shelf has
never been smooth *here*. Whether it is smooth on the owner's actual machine is still unknown,
and the remaining deficit against baseline (2.6 vs 4.6) is the price of the room and the
materials, both of which are wanted. The next lever, if it is still slow on real hardware, is
`frameloop="demand"` — the scene is static whenever nobody is scrolling.

### 2026-08-17 — The room, after I had closed it

**I closed "no floor detail and no walls" as a decision. The owner wanted a room, and that was
their call, not mine.** Worth recording as a process note rather than a technical one: design
authority is delegated to me *until the owner uses it*, and a decision I reason my way to from a
doc I also wrote is the easiest kind to be wrong about.

§3's *reasoning* survived even though its conclusion did not — it warns that walls, windows and
props end up looking like a bad game level, and that a half-built room is worse than honest
darkness. So: no windows, no props, no furniture beyond the bookcases. **A room reads as a room
because the lamp falls on real surfaces, not because things are standing about in it.**

Three draw calls, 20 → 22 (the old ground plane went): one **inverted box** doing all four walls
and the ceiling at once (`BackSide`, and its own floor face hides under the real floor, so it can
be plaster all over), one **floor plane** with procedural boards, one **skirting board**.
`roomSurfaces.ts` generates both surfaces the way `substrate.ts` generates case materials — one
parametrised seamless noise, no committed assets.

**Then it was invisible, and both causes were measured rather than guessed.**

1. **The lamp did not reach the room.** `LAMP_REACH` was 15, tuned when there was nothing to
   light but the cases. Measured the real geometry — floor at y = -6.60, lamp at -1.20, ceiling
   at 3.96 — and raised it to 24, ambient 0.12 → 0.20. A lamp whose pool dies before it meets
   the floor leaves the shelf in a void, which is the thing the room was meant to fix.
2. **The floor was too dark to show its own boards.** At `#241a12` the plank seams were there
   and could not be seen: **a bump map modulates light, so on a surface with no light left there
   is nothing to modulate.** Lightened to `#35271b`.

That second one is the same lesson as the bump-on-the-hidden-body earlier today, in a new
costume: the texture existed, and it did not arrive. Also raised the headroom from 1.8 to 3.6
units, so there is wall above the bookcases for the lamp to graze — a ceiling resting on the
furniture reads as a box.

### 2026-08-17 — Phase 3 finished: the last two bits built, the last four decided

**The per-item bump and the foil map were recorded as blocked on per-title art. They were not.**
Both are derivable from the artwork already packed in the atlas:

- **Deboss follows the printing.** A cover's own luminance gradient *is* its relief, so two extra
  texture taps and a central difference give a per-item bump with no authored maps at all. The
  normal is nudged rather than replaced, so the shared substrate still reads underneath it — the
  teardown's two layers, both present, as intended.
- **A foil stamp lands on the title treatment, which is the brightest thing on almost every one
  of these covers.** So the mask is a `smoothstep` on luminance driving `specularStrength`.
  Steelbook takes the most (its face is metal and its title genuinely is foil-stamped), an
  Amaray insert under a clear sleeve the least.

**Be honest about what that is:** it is *derived* foil, not authored foil. Where Stripe's mask
hits only the title, ours hits whatever is brightest — on *Iron Man 3* that is the armour and the
water, not the logotype. The right trade given §6 rules out generating art, but not the same
thing, and the difference is worth knowing before anyone "fixes" it.

**The back of the case now carries the owner's curated note**, and the way it gets there is the
point: `/shelf/notes` is a statically prerendered route handler, fetched **once** the first time
anybody turns a case and memoised after. Verified: four turns, one request. Nobody who only
browses ever pays for it, and the 152 notes stay out of the route's bundle — checked by grepping
`.next/static` for a note's text and finding nothing. `loadNotes()` resolves to an empty map
rather than rejecting, because a back missing its blurb is a small loss and a throw inside a
WebGL frame loop takes down the whole scene, which has happened here before.

**Four items were closed by deciding rather than building** — KTX2, LOD, the room, and spine-out.
The reasoning is above under "Phase 3 is complete". The one worth re-reading is KTX2: measuring
changed the argument rather than settling it. The atlas is 3.07 MB served `immutable`, so the
wire cost is one cold load a year per user; what is left is VRAM and decode, which is a real
worry on the target laptop and an unmeasured one. Deferred with a named trigger rather than
either shipping a transcoder speculatively or pretending the concern does not exist.

### 2026-08-17 — The materials get a surface

`PLAN.md` §1's second finding, applied: a **shared substrate bump per material**, which the
teardown rates as the trick worth stealing — a bump belonging to the *material* rather than to
the item is what makes many objects feel individually made without many bespoke assets.

`substrate.ts` generates one small, seamlessly tileable bump per form from a single parametrised
noise: litho card for VHS, fine polypropylene for Amaray, finer for Blu-ray, brushed metal for
steel and the film can, buckram for the bound volume, pitted clay for the tablet. Procedural, so
there are no new committed assets and nothing to fetch — and it is not the generative-AI route
`PLAN.md` §6 rules out.

**The first wiring put the bump only on the case body, where it barely shows.** Every case's
front is covered by its artwork plane, so a body bump survives only on the thin edges — which is
backwards for the form it was built for: **a steelbook's artwork is printed onto the metal**, so
the metal has to modulate the artwork rather than sit behind it. The substrate is on the cover
material too now. It samples through `vBumpMapUv`, three's own uv slot for the bump, so it tiles
across the face at the texture's repeat and is untouched by the atlas-cell window the shader
applies to `map` — two maps on one material wanting different UVs, which is exactly what they get.

**Both ends of the range were checked this time**, which is the lesson from earlier the same day:
Iron Man 3's steelbook shows a brushed sheen across its artwork, and Howard the Duck's VHS
clamshell reads as thick card with a legible spine.

**Not done, and it needs assets rather than effort:** the *per-item* bump layer and the foil map.
Both are per-title authored art in the Stripe original; we have none, and generating it is out.
The honest route, if wanted, is to derive a per-item bump from each cover's own luminance — the
pixels are already packed in the atlas.

### 2026-08-17 — Printed spines, and standing close enough to read them

Two more items off the owed list, and they turned out to be **one item**.

**Spine labels** for all 152 titles are one alpha-tested atlas (`spineAtlas.ts`), drawn as a
third `InstancedMesh` per form that shares the covers' `aCell` shader recipe and the body's own
instance matrices — so a spine is a face of the case rather than a thing placed near it, and it
pulls, turns and picks with it for free. Four extra draw calls, 16 → 20.

**Then it was invisible, and the reason was not what it looked like.** Two wrong diagnoses were
eliminated by measurement rather than argued about:

1. *Is the atlas wrong?* Mapped it onto a debug plane in the scene: all 152 labels present and
   correct. Not the atlas.
2. *Are the planes misplaced or facing away?* Gave them a flat red material and no texture: thin
   red strips exactly where intended, on each case's left face. Not the placement.

What was left was the two real causes. **A spine faces sideways while the lamp stands in front
of the shelf**, so a lit material there sits at ninety degrees to its only light source and
renders black — the ink was being drawn correctly and *lit into invisibility*. Spine ink is
`MeshBasicMaterial` now, deliberately the one unlit thing in the scene, because printing is ink
rather than a surface that reflects the room. And **the camera stood too far back**: framing a
whole four-level bookcase put it ~14 units out, where a spine is three screen pixels.

**So the framing changed, and it fixed the other owed item too.** The shelf is browsed close
now — about five cases across and a shelf and a half tall, a constant rather than a per-unit fit.
That single change is what makes *both* "no spine text" and "thickness is encoded but not
legible" go away, because neither was ever a geometry fault. Requires following the case
vertically in full: the old camera leaned only a fifth of the way towards it, which was right
from far back and leaves the case off-screen from here.

**The payoff is better than uniform legibility would have been.** A VHS clamshell is 32 mm and a
Blu-ray 12 mm, so on the Classic era unit the spines read — *The Punisher* is plainly legible
down the side of its case — while modern Blu-rays stay too thin to print on. That is the medium
encoding itself, exactly as `PLAN.md` intends, rather than a uniform label on everything.

**Recorded because the first conclusion was wrong and got committed:** the initial spine commit
concluded, in its message, that spine text could not work with face-out cases at any framing.
That was measured honestly and was still wrong — it had tested the browse framing, the pulled
framing and the reading framing, but all three on the **MCU** unit, which holds no VHS at all.
A conclusion about a range of media drawn entirely from the thin end of it. The cheap check that
would have caught it immediately was one click of "next universe".

### 2026-08-12 — Phase 4 begun: findable, shareable, and claiming nothing

The site is public and had a title and a description and nothing else. Added: `metadataBase`
on one stated origin (`src/lib/seo.ts`), canonical links, Open Graph and Twitter cards,
`app/sitemap.ts` (154 URLs) and `app/robots.ts`.

Three decisions worth keeping:

- **One origin, stated in code, not an env var.** A preview deployment must not advertise
  itself as the canonical home of 152 titles, and a wrong `metadataBase` only shows up in
  somebody else's link preview weeks later.
- **`/auth/` is disallowed to crawlers** because it carries a one-time confirmation token: a
  crawler that follows one burns it. `/sign-in` is a form, not a document.
- **The structured data claims only facts.** No medium (worked out by rule, not verified per
  title), no `aggregateRating` (there is nothing to aggregate), and a four-digit year rather
  than a fabricated month and day. A test asserts all three across all 152, because nobody
  ever looks at JSON-LD — a machine does, and then repeats it.

Verified against the built output, not the source: `robots.txt` and `sitemap.xml` as served,
the `<head>` of a title page, the JSON-LD block, and that the share image returns 200 from
TMDB. A title with no artwork emits no `og:image` at all rather than a broken one.

### 2026-08-12 — the shelf is under CI now

`e2e/shelf.spec.ts`, run in CI on every push. Three tests, all of them things **vitest
structurally cannot see**, and all of them things that actually broke while the shelf was
being built:

1. the scene rendering nothing at all (a throwing module in the shared masthead);
2. a click resolving to the wrong title (instance index and slug array disagreeing);
3. no-WebGL showing a black rectangle instead of saying so.

It asserts behaviour, not pixels: pixel comparison of a WebGL canvas across machines is a
flake generator, and *"the renderer drew the room and clicking a case opens that case"* is
the part that must not regress. The draw-call count the scene logs doubles as the control —
a blank frame shows up as a suspiciously small number rather than as a passing test.

**The CI step needs the two `NEXT_PUBLIC_SUPABASE_*` vars as placeholders**, and the reason
is worth keeping: the Supabase client throws at module load on an empty URL, which takes down
the whole page, including routes with nothing to do with auth. Verified by moving `.env`
aside — all three tests fail without them and pass with placeholders, which is CI exactly.

### 2026-08-12 — the object you are holding says what it is

A caption under the case being drawn out: name, year, and what the object is. Three decisions
worth keeping:

- **The name crosses the boundary, the note does not.** One short string per title, not 152
  notes shipped into this route's bundle for something that is a click away.
- **Story order prints the story year**, not the release year — the story year is what chose
  the object, and 2011 beside a 35mm film can invites exactly the wrong reading. BC says BC,
  and a title with no place on a timeline says "Outside time".
- **React sees the active title once per title, not once per frame.** The pull runs in the
  frame loop; nothing there should re-render anything.

It sits on a scrim, because the caption lands over whatever artwork happens to be behind it
and the quality floor is a contrast ratio rather than a hope.

### 2026-08-12 — in story order, the object changes too

The last unbuilt step of `docs/05-3d-shelf.md`'s order of work, and the half of the two
orderings that carries the surprise.

- 5000 BC is a **clay tablet**, 1845 a **bound volume**, the 1940s a **35mm film can**, the
  1960s–70s a **Super 8 reel**, and from the 1980s on it is the media we already had. Eternals
  opens the MCU shelf as a tablet; Captain America and Agent Carter stand as cans.
- **The layout buckets by form, not medium** — a rename more than a change. A form decides
  geometry, material, and therefore which `InstancedMesh` an instance lives in.
- **Round forms are cylinders pre-rotated to face the viewer**, so every instance matrix stays
  a plain translate-scale and the pull works on them unchanged. Their labels are
  `CircleGeometry`, whose UVs already fill 0..1, so the atlas window crops a disc for free.
- **Most of the catalogue is untouched, and that is the point.** A test asserts the switch
  changes a *minority*: if it ever became most of the catalogue, the two orderings would read
  as two different apps rather than one shelf seen another way.

### 2026-08-12 — the bookcases age, and fit what they hold

- **Wear per unit**, from the median release year of what stands on it, normalised across the
  room so it never goes stale. It travels on `setColorAt` — a per-instance attribute, not a
  material — which is why twelve differently-aged bookcases are still two draw calls. Only
  how dark and dry the wood looks varies, never its style (docs/05-3d-shelf.md §3).
- **Units are as tall as their collection needs**, capped at four levels and bottom-aligned to
  one floor. Four levels for everything turned Spider-Verse's two films into a one-column
  tower with two empty shelves — a sliver, not a bookcase.
- **The camera stands back by what it is looking at**: the height fit of the current unit
  against the width fit of the viewport, whichever is further, eased so a universe change
  dollies. Without it a two-title shelf sat adrift in a frame built for fifty-seven.

Both of the last two were found by looking at a screenshot of the smallest universes; neither
is visible from the MCU, which is the shelf you land on.

### 2026-08-12 — the shelf on a phone, and a loading state

Closing gaps that were listed and never done, rather than adding anything new.

- **A loading state.** The atlas is 3 MB and the Suspense fallback was null, so a cold load
  was an empty room for several seconds. Worth recording *how* it was verified: a warm local
  cache renders before the overlay can be seen, so the harness holds the atlas back for five
  seconds. **A fast machine hides a slow first visit** — if you cannot see the loading state,
  that is not evidence it works.
- **Touch.** One finger walks the shelf; on coarse pointers OrbitControls no longer takes
  that gesture for rotation. A pick now requires the pointer to have moved less than 8px
  between down and up — without that guard every swipe opens whatever case it ended over,
  which is the sort of bug that only exists on devices you have not opened.
- **Viewport fit.** fov is vertical, so a portrait phone saw a narrow slice with the unit
  running off both edges. The camera solves for the distance at which six units of shelf fit
  across, and keeps whichever of the width and height fits is further. **Scaling the distance
  by the aspect ratio was wrong** — it put a phone three and a half times too far back.
- **Reduced motion** drops the camera easing and keeps the pull, which is driven by scroll
  position rather than a clock. **No WebGL** says so and links to the catalogue.

### 2026-08-12 — a room of bookcases, one per universe, and scroll pulls a title out

**Owner's direction, and it supersedes the continuous run built earlier the same day.** See
`docs/05-3d-shelf.md` §0 for the reasoning and what survives of the old concept.

- **Twelve shelf units**, one per universe, standing side by side in one room, each
  chronological within itself. `buildShelfLayout` now takes runs rather than a flat list and
  buckets instances by medium across the whole room, so a bookcase is not a draw call.
- **Each unit has a carcass** — four shelves, a top, two uprights, a back panel — all extra
  instances of the same unit box. 16 draw calls for twelve bookcases and 152 cases. The back
  panel is what stopped a unit reading as covers floating in a void.
- **Scroll draws a title out of the shelf and puts it back.** `sin(π · fraction)` over one
  step, so keeping the wheel moving returns the case and brings out the next. The case turns
  toward the camera as it comes; the cover plane and, for the three artless titles, the blank
  plane travel with it, or a pulled case leaves its own front behind on the shelf.
- **Arrows change universe**, keyboard left/right too, and the lamp travels with the camera.

**Four framing faults, each found by looking and none by reading the code:**

1. The camera followed the active case's *height*, which swung the view a whole unit as the
   walk stepped down a column and threw the bookcase into the corner of the frame. It leans
   20% toward the case now instead of following it.
2. Aiming squarely at the first case on a unit points a third of the frame at empty room.
   The aim is clamped to stay 3.2 units inside the unit's own span.
3. The camera was fitted to the cases, not to the furniture, so the new carcass cropped top
   and bottom. `bounds` now includes it.
4. The floating titles hung at a height the new top board occupies, so they would have been
   pushed through it.

Verified in a browser at the production build: the pull reads, the arrows move between
universes (MCU → Classic era → X-Men (Fox)), the page never scrolls, and a click on a pulled
case still opens its own page (Logan). 83 tests green.

### 2026-08-12 — scroll travels, and the shelf has two orderings

Steps 3 and 4 of `docs/05-3d-shelf.md` §7, in the order it sets out.

- **Scroll travels the run** instead of zooming, which is the same gesture and the same
  meaning as the DOM catalogue. It needs a native `wheel` listener, not React's `onWheel`:
  React registers wheel handlers passively, so `preventDefault` inside one does nothing and
  the page scrolls behind the canvas while the run travels. The step is 0.18 units per line —
  the first value tried, 0.55, crossed half the catalogue in one flick of a trackpad.
- **Two orderings.** `src/lib/chronology.ts` resolves `chrono` to a sortable year against the
  51 distinct non-year strings actually present — ranges take their start, `Christmas 2013`
  and `c. 2004` give up their year, decades give their first year, and the five relative ones
  ("shortly before the Snap") are a named table of five with the reference title in a comment.
  **BC is matched before the plain-year rule**, or `5000 BC – 2024` resolves to 2024 and files
  Eternals with the present day — losing the title that opens the whole story order.
- **The 14 that cannot be placed are not placed.** They lift off the run and hang above it,
  scattered by a hash of the slug so the same title hangs in the same place on every machine,
  with the boards deliberately sized to the run so there is nothing underneath them. The test
  names all nine distinct titles rather than counting them: a parser change that floated a
  *different* fourteen would keep the count and quietly break the idea.
- **The era buttons hide in story order.** A medium is scattered along the whole story run, so
  "where Blu-ray begins" is not a place there. Deleting the buttons was cheaper than making
  them lie.
- The two modes state their own truth status in the UI, in the two registers §4 asks for:
  release order is a fixed rule, story order is openly a conceit.

Verified in a browser at the production build: story order opens on Eternals, Captain America
and Agent Carter move to the 1940s, the floating titles read as unanchored, one wheel gesture
travels about five columns, and the page itself never scrolls. 83 tests green.

### 2026-08-12 — one continuous run, and a lamp that travels with you

`docs/05-3d-shelf.md` §7 puts the continuous run first and says to look at it before funding
anything else, so that is all this is: the structural change, plus the lamp §2 asks for.

- **Five era rows became one column-major run**, four shelves tall, release order end to
  end. `buildShelfLayout` takes a flat list now and buckets instances by medium internally,
  so the draw-call story is unchanged (13, down from 15 — four long boards instead of five
  short ones). A column is one moment in time; the medium changes underfoot as you travel.
- **The lamp rides the focus point.** Ambient dropped to 0.12 and the warm directional key
  is gone; what lights the run is one point light with real falloff, eased along x with the
  camera. Travel far enough and where you came from is genuinely dark — §2's "infinite
  without lying", since looping the geometry would put 1977 after 2026.
- **The framing is measured, not guessed.** Camera height and distance come from the run's
  own bounds; deriving them from the level pitch aimed a case-height too low and cropped the
  top shelf, which is what the first screenshot showed.

**Looked at, four passes, before being called done** — the v1 lesson holds and earned its
keep twice here. Pass 1 cropped the top and bottom shelves and lit the whole run evenly;
pass 2 fixed the framing and the falloff; pass 3 filled the dead third of the frame.

**Picking re-verified, not assumed.** Instance → slug is a bare array index, so a layout
rewrite that reorders instances yields a *plausible wrong title*, never an error. Three
covers identified by eye in the screenshot were clicked: Captain America (1990), Blade II
(2002) and Howard the Duck (1986) each opened their own page.

**Measured once it existed:** the eras are wildly uneven along the run — VHS is 2 columns of
38 and the streaming era is 17. The first three eras share the opening screen. Recorded in
`docs/05-3d-shelf.md`, because it decides how much the landmark buttons and the era-sweep
"vertical band" are worth before anything is spent on either.

### 2026-08-11 — the shelf can be travelled and clicked

The two gaps at the top of "What Phase 3 still owes", and nothing else. Both are small
enough that the whole change is four files and no new dependency.

- **Picking.** `layout.media[]` now carries `slugs`, in the same order as the matrices, so
  a raycast hit resolves through `slugs[e.instanceId]` and nothing else has to exist. The
  handler sits on the row `<group>`, not on 152 objects: body and cover share an index
  order, so either hit answers, and a pointer event over an InstancedMesh costs a raycast
  per move.
- **Travel.** Era buttons and arrow keys set one focus point; `CameraRig` eases the camera
  to it. It moves the camera position and the orbit target by the same delta so the
  viewer's chosen angle and zoom survive the jump.
- **Copy.** The era buttons print `shelf.label` from `catalogue.ts` rather than a second
  copy of the era names in the scene file, which is why `ShelfRowData` gained a `label`.

**Verified in a browser, at the production build, not by reading the diff.** A click at the
centre of the canvas navigates to `/title/spider-man-2002` and the page it lands on says
"Spider-Man"; the era jump and the arrow keys both visibly move the camera; `[shelf] draw
calls: 15` afterwards, unchanged. Screenshots taken at each step.

**Merged to `main` and re-checked on the live site**, since a green deploy is not a working
app: `/shelf` on marvel-trackerv2.vercel.app renders all 152 at 15 draw calls, the era jump
moves the camera, and a click at the centre opens Spider-Man (2002). The only difference
production showed was time-to-first-render — see item 8 above.

**A false failure worth not repeating: the first browser run showed Chromium's "This page
couldn't load" on `/shelf`, which looks exactly like a WebGL crash in the new code.** It was
not. `.env` is gitignored, so an isolated worktree does not have it, the Supabase client
throws on an empty URL at module load, and the renderer dies before the canvas mounts —
in a route that has nothing to do with auth. What separated harness fault from page fault
was the control: loading the plain DOM catalogue in the same browser, which worked. The
same run against the main checkout's existing build rendered fine, which located the fault
precisely. **A worktree is not the app until its untracked environment is in it.**
Turbopack also refuses a symlinked `node_modules` — `npm ci` in the worktree, not a link.

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
