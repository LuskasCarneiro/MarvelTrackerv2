# The 3D shelf

The approved direction for Phase 3, settled with the owner on 2026-08-11. Nothing below is
built yet except where it says so. `src/app/shelf/` holds the first increment; this document
is what it should become and why.

Read `docs/PLAN.md` §1 for the `press.stripe.com` teardown that the material approach comes
from, and `docs/02-design-system.md` for the palette and the lamp.

---

## Where it actually stands

**Built as of 2026-08-12: §1's continuous run, §2's travelling lamp, §6's click-through,
arrow keys and era landmarks.** `/shelf` renders all 152 titles as one column-major run,
four shelves tall, release order end to end, at **13 draw calls** and 46k triangles — one
`InstancedMesh` per medium for the bodies and one for the covers, so the 66 streaming-era
titles cost what the 7 VHS ones cost. Covers come from a single 4096² atlas.

**§4's two orderings are built too, as far as step 4 of the order of work goes: the reshuffle
only, objects unchanged.** `src/lib/chronology.ts` turns `chrono` into a sortable year —
written against the 51 distinct non-year strings actually in the catalogue — and returns null
for the 14 that belong outside time, which then hang above the run with no board beneath
them. Story order opens on Eternals at 5000 BC and puts Captain America and Agent Carter in
the 1940s. The era buttons hide in story order: a medium is scattered along the whole run
there, so "where Blu-ray begins" is not a place and a button claiming it is would mislead.

Not built: pull-and-turn, the historical objects (step 6 — the film can, the clay tablet),
the wear gradient and back panel, spine text, era materials.

### Measured once it existed: the eras are not evenly spaced, and landmarks are cheap

Column-major packing divides the run length by four, and the catalogue is heavily weighted
to the present. The five eras begin at these columns of 38:

| era | first column | share of the run |
|---|---|---|
| VHS clamshell | 0 | 2 columns |
| DVD Amaray | 1 | 3 columns |
| Blu-ray case | 5 | 4 columns |
| Steelbook | 9 | 12 columns |
| No physical release | 21 | **17 columns — 66 titles** |

So the first three eras all sit within the opening screen, and an era jump between them
moves the camera a metre. That is not a layout fault to fix, it is what the catalogue is:
Marvel made more in the last six years than in the previous thirty. It does mean the
landmark buttons earn their keep only at the far end, and that **the "vertical band" era
sweep is a one-column event for the early media** — worth knowing before spending anything
on making those transitions ceremonial.

**The spike that preceded it** (`/spike/case`, one Amaray at real dimensions) answered the
question Phase 3 was funded on: procedural geometry does read as a physical object, and
`MeshPhongMaterial` reproduces the Stripe approach without `MeshPhysicalMaterial`.

---

## 1. One continuous run, not five rows

**The current five-row layout contradicts the concept and should be replaced.**

`CLAUDE.md` says the shelf *"physically ages **as you move through it**"*. Five rows, one per
era, is not moving through anything — it is five bins you jump between. The ageing has to be
something you travel along.

So: **one continuous run**, chronological end to end, with the medium changing underfoot.
Era boundaries stop being layout and become **landmarks you pass**.

This also removes the worst visual problem in the current build. The rows hold 7, 13, 16, 50
and 66 titles; that disparity reads as broken rather than designed, and no camera framing
rescues it. A single run has no rows to be uneven.

**Filled column-major**, three or four shelves tall. A column is one moment in time;
travelling right moves forward through it. The era change then sweeps past as a *vertical
band* — you watch clamshells give way to Amarays across the full height at once, which is far
more legible than any label. It also cuts the journey from ~205 units to ~70 and gives the
thing the mass of a real bookcase instead of a single thin line of objects.

---

## 2. The infinite feeling comes from the light, not the geometry

**Do not loop the run.** It would lie: 1977 must not follow 2026, and the chronology is the
entire point.

Instead, replace the directional light with **a lamp that has real falloff**. The run
dissolves into darkness a few metres out in both directions, so the eye never finds an end.
That is honest, and it is cheaper than any geometry trick.

It also fixes something currently flat: the scene is lit evenly, so it reads as a display
case rather than a room at night. Falloff gets the room for free.

---

## 3. The furniture ages too, and dissolves at the end

Originally the plan was a constant frame — unchanging furniture so the changing objects stay
legible. **That was reconsidered and rejected**, for one reason:

**66 of 152 titles never had a physical release.** They currently render as thin cards
sitting on a shelf, which is the one arrangement that contradicts what they mean. If the
furniture ages along the run, it can thin, dry out and dissolve into the dark at the
streaming end, leaving those covers suspended with nothing beneath them. That is what
happened, said without a word of copy, and it is the strongest beat available.

The legibility worry is answered by making the two changes **different in kind**:

| | rhythm |
|---|---|
| the objects | **stepped** — five discrete media, each one noticeable |
| the furniture | **continuous** — a slow gradient you never catch happening |

Two changes at the same rhythm turn to mush. Stepped against continuous reads cleanly.

### What the gradient carries: wear, not style

A 1980s unit morphing into a 2020s unit is a costume change and will look like one. **Wear**
is better and nearly free — one texture whose parameters vary along the travel axis:

- **early run** — deep scuffs, ring marks, sun-faded front edge, dust in the grain
- **middle** — honest use, softened edges
- **late** — clean, barely touched; nothing has sat here long enough to mark it
- **end** — the wood loses substance and goes to darkness

Note the direction: oldest section most worn, newest untouched. Correct, and quietly
satisfying.

### The wood must be boring

Dark, matte, low-saturation, grain visible only where the lamp rakes across it. **The covers
are the only colour in the scene.** 152 pieces of artwork already compete with each other;
furniture with character joins that fight and the whole thing turns to noise. The wood's job
is to be warm and shut up.

### Do not build a room

Walls, windows and props are a great deal of work to end up looking like a bad game level. A
half-built room is worse than honest darkness. What is worth adding is **a back panel**
behind the cases — real shelves have backs, it stops the floating-in-void feeling, and it
gives the lamp a surface to fall on. One plane.

---

## 4. Two orderings, and the object changes with them

A switch between **release order** and **story chronology**. This is the owner's idea and it
is the best extension of the concept so far: the same title becomes a different object
depending on which question you are asking.

*Captain America: The First Avenger* is a Blu-ray by release, and a **film can** by story,
because it happens in 1943.

### The mapping

Story eras present in the data run from **5000 BC to 2026**:

| story era | object |
|---|---|
| 5000 BC | clay tablet |
| 1845 | bound volume |
| 1940s | 35 mm film can |
| 1960s–70s | Super 8 reel |
| 1980s–90s | VHS |
| 2000s | DVD |
| 2010s | Blu-ray / steelbook |
| 2020s+ | nothing |

**The two orderings converge in the modern era and diverge in the past.** For roughly 120
titles the object barely changes, because a 2015 story shipped on 2015 media. The switch
transforms exactly the titles you would want it to — Captain America, Captain Marvel,
Eternals, Agent Carter — and leaves the rest alone.

That is not a weak payoff, because **the order changes for everything**. Release order opens
on 1970s television Spider-Man; chronological order opens on a clay tablet and a film can.
The whole run reshuffles, and that is the main event.

### The two modes do not have the same truth status

Say this plainly in the UI, in two registers, or the site starts asserting things that are
not true:

- **Release order** is roughly factual, already hedged in copy as *"worked out from the year
  by a fixed rule, not verified title by title."*
- **Story order is pure conceit.** Nothing was recorded in 1943; there is no artefact. It is
  how the story would have reached you if someone had been there.

The second is the more poetic of the two. It just must not wear the first one's language.

---

## 5. The chronology data — measured, not assumed

From `titles.json` joined with `notes-en.json`'s `chrono` map, all 152 counted:

| | titles | example |
|---|---|---|
| bare four-digit year | **88** | `2008` |
| parseable by rule | **45** | `c. 2004`, `2013–2014`, `Christmas 2013`, `5000 BC – 2024`, `retro 1960s` |
| relative to another title | **5** | `shortly before the Snap` |
| **no place on a line** | **14** | `outside time`, `multiverse`, `its own reality` |

The 45 need circa-stripping, range-start extraction and a few festive years. Mechanical.

The 5 relative ones each need one manual reference and then resolve: *Elektra* (after
Daredevil), *Ghost Rider: Spirit of Vengeance*, *The Wolverine* (after X3), *Black Widow*
(after Civil War), *Ant-Man and the Wasp* (before the Snap).

### The 14 that cannot be placed are the best part of this

Both *Spider-Verse* films, *Loki* ×2, *What If…?* ×3, *Marvel Zombies*, *Legion* ×3,
*Agents of S.H.I.E.L.D.*, *Eyes of Wakanda*, *Your Friendly Neighborhood Spider-Man*.

**A title that exists outside chronology cannot sit on the chronological shelf — so it
should not.** Flip to story order and those 14 lift off the run and hang just beside it,
unanchored. Nothing needs to explain why.

This is not a workaround dressed up as a feature. Look at the list: they are precisely the
titles *about* unstable reality — multiverses, timelines, the TVA, a character who may be
imagining everything. The data and the theme agree. Do not "fix" these by assigning them a
year.

---

## 6. Navigation

- **Scroll travels along the run.** Same gesture as the DOM page, same meaning: forward
  through time. Drag stays for looking around, never for travelling.
- **Era markers to jump.** ~70 units is still a long way.
- **Arrow keys**, which the quality floor requires anyway.
- **Clicking a case opens its title page.** Currently clicking does nothing, which makes the
  shelf an ornament rather than a way into the catalogue. Needs instance picking — raycast to
  `instanceId`, then back to the slug. **Cheapest large win on the list.**

---

## 7. Order of work

1. **The continuous run**, column-major, with the lamp falloff. The structural change. Look
   at it before funding anything else.
2. **Click-through to the title page.** Small, and it is what makes the thing usable.
3. **Scroll-to-travel and era jumps.**
4. **The two orderings — data and reshuffle only, objects unchanged.** Resolving chrono to
   sortable years and floating the 14 is where nearly all the meaning lives, and one look
   tells you whether the chronological run is compelling.
5. **The wood, the wear gradient and the back panel.**
6. **The historical objects**, starting with the film can, because *Captain America* is the
   title everyone will test the switch with.
7. Spine text, era materials (the teardown's two bump layers and foil), LOD, KTX2.

Steps 4 and 6 are deliberately split. The expensive half of the ordering idea is the new
object forms, and it should be funded only after the reshuffle has been seen to work.

---

## Known costs and open questions

- **`/shelf` transfers 3.7 MB**, almost all atlas. This is where KTX2/Basis finally earns its
  toolchain; `scripts/build-atlas.ts` writes WebP today and switching format is one run.
- **The historical objects roughly double Phase 3's object work.** A can is a cylinder and a
  tablet is a slab — not variations on a box. Architecturally free (one `InstancedMesh` per
  form, as now); it is asset work, and visual work costs several passes per element.
- **Thickness is encoded but not legible.** A VHS clamshell is 32 mm and a Blu-ray 12 mm, and
  at the current framing you cannot tell. The geometry is right; the presentation does not
  reveal it. Unsolved.
- **Never opened on a phone**, and there is no reduced-motion or no-WebGL path for `/shelf`.
- **Undecided:** whether cases sit spine-out with the lamp turning them face-out as you pass,
  or stay face-out as now. Face-out is a video shop convention; a domestic collection is
  spine-out. The lamp-reveal is the more distinctive and the more expensive. Not settled.
