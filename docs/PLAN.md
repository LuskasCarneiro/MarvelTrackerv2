# Marvel Tracker v2 — Plan for review

**Status:** awaiting owner comment. No code written yet.
**Date:** 2026-08-06
**Repo (empty, to be filled):** https://github.com/LuskasCarneiro/MarvelTrackerv2.git
**Local:** `~/Desktop/marvel-tracker-v2`

---

## 1. What I found in press.stripe.com (not guesses — I read the bundle)

This matters because it changes what we should copy. Most people look at that site and
copy *the cream background and the serif*. That's the least interesting thing about it.

**It is three.js.** `THREE.WebGLRenderer`, `THREE.WebGLProgram`, `THREE.BufferGeometry`
and the standard three shader chunks (`lights_pars_begin`, `encodings_fragment`,
`shadowmap_pars`) all survive minification in
`b.stripecdn.com/.../v1-chunk-2PON3HJD.js` (516 KB). The entry point is a component
literally called `PressHomepageCanvas`.

**The books are driven by a per-book JSON material, embedded in the HTML** as
`<script type="application/json" id="js-book-materials">`. 21 entries. Each one:

```json
{
  "shininess": 3,          "thickness": 3.4,
  "diffuseMapCustom": "PCA_diffuse",   "diffuseBaseColor": [0.04, 0.04, 0.35],
  "bumpMapBase": "shared_bump_buckram", "bumpScaleBase": 0.04,
  "bumpMapCustom": "PCA_bump",          "bumpScaleCustom": -0.04,
  "foilMap": "PCA_foil",   "foilDetail": 2, "foilSpecular": 0.2, "foilOpacity": 0.0,
  "glitterMap": "shared_glitter", "glitterSpecular": 0.2, "glitterOpacity": 0.3,
  "reflectiveness": 0.6
}
```

Plus a `palette`: `{"color": "#18185E", "backgroundColor": "#C1B676", "coverColor": "#1D1D62"}`.

Four things worth stealing, in order of importance:

1. **`shininess` means it's `MeshPhongMaterial`, not PBR.** Phong is *far* cheaper than
   `MeshPhysicalMaterial`. They extended it with custom maps via shader injection rather
   than reaching for full physically-based rendering. This is the single most useful
   finding — it's why the site is smooth, and it's why this approach will survive your
   i7-5600U's integrated graphics.
2. **Two bump layers, not one.** A *shared* material bump (`shared_bump_buckram`,
   `shared_bump_paper`, `shared_bump_none` — 12/6/1 across the catalogue) plus a
   *per-book* bump. The shared one is the physical binding cloth; the per-book one is the
   debossing of that specific cover. Layering a shared substrate under per-item detail is
   the trick that makes 21 objects feel individually made without 21 bespoke assets.
3. **Foil is a separate map with its own specular and opacity.** Real Stripe Press books
   are foil-stamped, so the shader models foil-stamping. The material is *true to the
   physical object*, not decorative.
4. **Thickness is real data.** Range 2.4–3.4 across the catalogue; page count, encoded as
   geometry. Nobody labels it. You just feel that some books are bigger.

The lesson: **the 3D isn't a gimmick layer on top of a catalogue — the physical object
IS the data visualisation.** That is what we should apply, and it's a much better brief
than "make it look like Stripe Press."

---

## 2. The core idea

> **The archive is a shelf of home-video releases, and the shelf physically ages as you
> move through it.**

Stripe Press had it easy: their product is already a beautiful physical object. Marvel's
equivalent physical object — the thing that would actually be on a shelf in your house —
is the **home-video release**. And unlike a book, it *changed medium several times* across
the 40 years this archive covers.

So the object encodes era, natively:

| Years | Object | Material |
|---|---|---|
| 1986–1996 | VHS clamshell | matte litho cardboard, soft corners, rental sticker |
| 1997–2006 | DVD Amaray | polypropylene, low sheen, textured shell |
| 2006–2013 | Blu-ray case | thinner, glossier, blue tint in the plastic |
| 2013–2019 | Steelbook | embossed metal, high specular, no paper |
| 2019– | *no physical release* | a flat card — honest about the Disney+ titles |

Scroll from *Howard the Duck* to *Avengers: Doomsday* and you watch cardboard become
plastic become metal become nothing. That's forty years of how we owned films, told
without a single label. It is exactly the Stripe Press move — thickness = page count —
applied to a subject where the encoding is richer.

**Honesty note, and this is a rule not a caveat:** the medium is derived from *release
year by rule*, not verified per title. Some titles broke the pattern (Blade got both VHS
and DVD in 1998; several Disney+ shows got Blu-ray later). The docs will say the rule is
a rule. v1's own CLAUDE.md warns against presenting a guess as a verified fact, and that
warning carries over. Where a title genuinely differs and I can verify it, it gets an
override in the data with a source. Otherwise: rule, stated as a rule.

### The material system (direct translation of Stripe's JSON)

```
thickness        ← runtime (films) · episodes × runtime (series)   [real data, unlabelled]
bumpMapBase      ← shared per-medium: vhs_card | amaray | bluray | steel | none
bumpMapCustom    ← per-title, derived from the cover art's own luminance
diffuseMapCustom ← the actual cover art (TMDB)
foilMap          ← the title treatment; Marvel logos really are foil-stamped
glossMap         ← shrink-wrap / clear-sleeve highlight
wear             ← scuff intensity, scaled by age. Old tapes look handled.
palette          ← extracted from the cover art, per title (as Stripe does)
```

### The signature interaction

Pull a case off the shelf. It comes forward, you can turn it in your hands, and **the
back of the case is the detail view** — because a home-video back cover already *is* a
detail view: synopsis, runtime, certification, cast, barcode. That layout was solved in
1994. We use it rather than inventing a card.

### Your data as a physical act

Rating a title puts a **video-store sticker** on the case. Marking it watched puts a
**date stamp on the spine label**. This keeps the "carimbar" verb from v1 — which works —
but grounds it in a real object instead of a fictional agency.

---

## 3. Look and feel

**The departure from the reference, and why.** Stripe Press is light because a bookshop
is light. A home-video shelf lives in a room, at night, under a lamp. We go **dark and
warm** — the colour of a rental shop at closing. Deep umber-ink background, tungsten pools
of shelf light, and the covers do the glowing.

**There is no fixed accent colour.** Like Stripe's per-book `palette`, each title's
palette is extracted from its own artwork, and the chrome tints toward whatever you're
looking at. The site's colour is the film's colour. (This also dodges the two
default AI looks — it is neither cream-and-terracotta nor black-with-acid-green.)

**Type** — all open-licence (SIL OFL), self-hosted, zero network font calls:

| Role | Face | Why this one |
|---|---|---|
| Display / UI | **Archivo Variable** | Has a real width axis. Compressed for spine labels, normal for UI — one family doing the job the object needs. Named for archives. |
| Body prose | **Newsreader** | Has an optical-size axis; designed for screen reading. Not Playfair/Cormorant — deliberately. Your 152 hand-written notes deserve a reading face. |
| Data | **Archivo** small-caps + tabular figures | Runtimes, years, episode counts. |

**Quality floor, not negotiable:** responsive to mobile, visible keyboard focus,
`prefers-reduced-motion` honoured, WCAG AA contrast (v1 already caught me shipping 2.7:1
text once — the token set gets contrast-checked in CI this time).

---

## 4. Stack

| Layer | Choice | Reasoning |
|---|---|---|
| Framework | **Next.js 15 App Router, React 19, TypeScript strict** | You named Vercel first; this is the shortest path there, and it gives real SSR for the DOM layer (SEO + fast first paint). Ports to Cloudflare via `@opennextjs/cloudflare` if you switch. |
| Styling | **Tailwind v4** | CSS-first config, no JS config file, tokens as CSS custom properties. |
| 3D | **three.js + React Three Fiber + drei** | Stripe uses raw three.js; R3F is a React reconciler over the *same* library, so we get their approach with declarative scene code next to the app. |
| Auth + DB | **Supabase** — Postgres + Auth + **Row Level Security** | This is the security answer to "each person sees only their own ratings": the *database* enforces it, not app code I could get wrong. Free tier is ample. |
| Content data | **Build-time TMDB pull → committed JSON + optimised textures** | Zero runtime API calls for content. Fast, cheap, works if TMDB is down, and no API key ships to the browser. |
| Tests | **Vitest** (unit) + **Playwright** (E2E + frame-dump harness) | The frame harness is carried over from v1 — it is the single most valuable tool that project produced. |
| CI | **GitHub Actions** | typecheck · lint · test · build · contrast check · Lighthouse budget |

### Performance plan (your laptop is the design constraint)

4 threads, no discrete GPU. 152 textured objects is where this dies if we're careless.

- **Instanced rendering** — one draw call per medium family, not per case.
- **Texture atlases** — covers packed into a few 2048² KTX2/Basis atlases, not 152 textures.
- **LOD** — full-resolution cover art only for the ~12 cases nearest the camera.
- **DPR capped at 1.5**; adaptive quality drops shelf lights if frame time exceeds 22 ms.
- **The DOM layer is a real design, not a stub.** No-WebGL, reduced-motion, low-power and
  crawlers get a proper catalogue that stands on its own. It's built *first* (see phasing).

---

## 5. What I need from you (tool access)

You asked to be warned about this. Three items, two of them blocking:

### 1. TMDB API key — **blocks Phase 1**
**What it is:** The Movie Database — the open film/TV metadata API. Posters, backdrops,
transparent title logos, runtimes, cast, episode counts, release dates. It's what v1's
OMDb integration should have been; OMDb's images are weak by comparison.
**How to get it:** free account at themoviedb.org → Settings → API → request a v3 key
(approval is instant for personal use).
**What to hand me:** the v3 key string. It goes in `.env.local`, which is gitignored, and
it is only ever used by the build-time script — it never reaches the browser.

### 2. Supabase project — **blocks Phase 2**
**What it is:** hosted Postgres with authentication and Row Level Security built in.
It is how logins and per-user ratings work at all.
**How to get it:** free account at supabase.com → New project → pick a region (London or
Frankfurt for Portugal) → Project Settings → API.
**What to hand me:** `Project URL`, `anon` key, and `service_role` key.
The first two are public by design; the `service_role` key is server-only and I'll keep it
out of every client bundle and out of git.

### 3. Vercel — needed only to deploy (Phase 0 end)
Signing in with your GitHub account is enough; you can click "Import" on the repo yourself
and I never need a token. If you'd rather I deploy from here, a Vercel CLI token would do
it — your call, and it's the lower-trust option to skip.

**Nothing else is missing.** Node 22, npm, `gh` (already authenticated as LuskasCarneiro),
git and Chromium/Playwright are all present and verified on this machine.

---

## 6. Data

v1 has **82 films + 70 series = 152 titles**, hand-curated, each with a universe key, a
release year, a chronology string, and **a real hand-written paragraph in pt-PT**. That
prose is the most valuable thing in v1 and it is not regenerable — it gets migrated
verbatim, not rewritten.

Pipeline: `scripts/build-data.ts` reads the curated v1 list → matches each title against
TMDB (with a hand-checked override file for the ambiguous ones — there are several
*Punisher*s and two *Fantastic Four* reboots) → downloads artwork → generates
bump/foil/gloss maps and extracts the palette → writes `data/titles.json` + atlases into
the repo. Committed output, reproducible input. Same discipline as v1's generated SVG:
**the generator is the source, the JSON is a build artifact.**

### Asset sources — decided, and why not generative AI

| Asset | Source | Licence |
|---|---|---|
| Cover art, backdrops, transparent title logos | **TMDB** | permitted for this use, attributed |
| Tiling materials (cardboard, polypropylene, brushed metal, scuff, dust) | **Poly Haven / ambientCG** | CC0 — no key, no account, direct download |
| Room HDRI (tungsten interior) | **Poly Haven** | CC0 |
| Foil map | derived from the TMDB transparent logo | generated |
| **Spine artwork** | **generated procedurally** | see below |

**The spine problem.** TMDB supplies theatrical one-sheets, not box art — but a shelf shows
you *spines* first. Real home-video spines are a solid bar in the cover's dominant colour
carrying the title logo and studio marks, so we composite exactly that: extract the palette,
place the transparent logo, set the type in Archivo Compressed. Procedural means all 152 are
consistent and none are missing, which no scraped box-art source could promise.

**Generative video/image tools (Higgsfield, Sora, etc.) are not used for product assets.**
Considered and rejected 2026-08-06: the shelf needs *seamlessly tiling* textures with split
normal/roughness channels and an equirectangular HDRI — format mismatches, not quality gaps
(a non-tiling texture seams visibly on every one of 152 boxes). And v1's most expensive
lesson was that generated stand-ins lose to real assets: the Iron Man mask cost eight passes
before the answer turned out to be a real photograph. Legitimate use is a **launch video**
in Phase 4+ — promotion, not product.

Record shape (synthetic values):

```json
{ "slug": "iron-man-2008", "title": "Iron Man", "universe": "mcu",
  "releaseYear": 2008, "chrono": "2010", "runtimeMin": 126,
  "medium": "bluray", "note": "<pt-PT paragraph, migrated verbatim from v1>",
  "palette": { "bg": "#1D1D62", "ink": "#C1B676" }, "tmdbId": 0000 }
```

Dates ISO-8601 (`2026-08-06`); years plain integers.

---

## 7. Phasing — each phase ships something usable

| Phase | What | Ships |
|---|---|---|
| **0 — Foundations** | Repo, Next+TS+Tailwind, CI, `docs/` memory, Vercel deploy | A live URL |
| **1 — Catalogue** | TMDB pipeline, 152 titles, the DOM design, detail pages | A real browsable archive |
| **2 — Accounts** | Supabase auth, RLS, rate/watch/log, your data only | A working tracker |
| **3 — The shelf** | three.js, the material system, era-morphing cases, pull-and-turn | The thing that amazes |
| **4 — Polish** | Motion, a11y audit, perf budget, OG images, SEO | Production |

**Why the 3D is last, deliberately.** The temptation is to build the exciting part first.
But if the shelf comes first, the DOM layer becomes a sad fallback instead of a real
design, and ratings can't be tested before auth exists. Building the shelf last means it
lands on top of a product that already works — and if you run out of appetite at Phase 2,
you still have a genuinely good site.

---

## 8. Orchestration — who does what

Opus 5 (xhigh) orchestrates, designs the shader and the visual system, and reviews
everything. Subagents get the model their task actually needs, and **every subagent
prompt opens with `/ponytail`** to keep them terse.

| Work | Agent | Model |
|---|---|---|
| Scaffold, configs, CI | `general-purpose` | **haiku** — mechanical |
| TMDB pipeline, title matching | `general-purpose` | **sonnet** — fuzzy matching needs judgement |
| Supabase schema + RLS | `general-purpose` → `ecc:security-reviewer` | **sonnet**, never haiku — security boundary |
| DOM catalogue + detail pages | `general-purpose` | **sonnet** — real design execution |
| Auth flows, route protection | `general-purpose` → `ecc:security-reviewer` | **sonnet** |
| Shelf shader + material system | **me (Opus)** authors; `general-purpose` **sonnet** wires it | the hard creative part |
| Tests | `general-purpose` | **haiku** — mechanical once specs exist |
| Code review | `ecc:react-reviewer`, `ecc:typescript-reviewer`, `ecc:a11y-architect` | their own |
| Docs / memory upkeep | `general-purpose` | **haiku** |

---

## 9. Project memory — surviving a session close

```
CLAUDE.md              ← read first, every session. Points at everything below.
docs/
  00-brief.md          your intent, verbatim + standing rules
  01-architecture.md
  02-design-system.md  tokens, type scale, material vocabulary
  03-data-pipeline.md
  04-auth-and-rls.md
  05-3d-shelf.md       shader contract, perf budget, what was tried and failed
  06-progress.md       ← THE resume file: dated log, "you are here", next action
  07-open-questions.md
  adr/NNNN-*.md        one decision per file, including the options rejected
```

Written into `CLAUDE.md` as standing rules:

- Every session **starts** by reading `CLAUDE.md` → `docs/06-progress.md`.
- Every session **ends** by updating `06-progress.md` and committing.
- **No AI attribution in any commit, ever.** (Standing, all your projects.)
- All user-facing copy is **European Portuguese (pt-PT)**.
- **Update the Obsidian second brain whenever there's a transferable lesson, and push it.**
  Not project status — the generalisable engineering lesson, in `~/Desktop/LuskasSecondBrain`.
- Failed approaches get recorded, so a future session doesn't re-walk them. (v1 hand-drew
  the Iron Man mask eight times. That must not happen again.)

---

## 10. Four things I'd like your comment on

1. **Language** — keep everything pt-PT? I'd say yes: your 152 notes are already written,
   they're good, and a Portuguese Marvel archive is more distinctive than another English
   one. The register shifts from v1's TVA-bureaucratic to archival/editorial.
2. **Dark, not cream** — I'm proposing we invert Stripe Press's light palette for the
   reason in §3. Say the word if you want to stay light and I'll rework it.
3. **Public sign-up?** You said "various users", so I'm assuming genuinely public
   registration. That adds rate-limiting and email deliverability work in Phase 2. If it's
   really just you and some friends, an invite-only allowlist is half the work.
4. **Public profiles?** Strictly private shelves, or can someone share a link to theirs?
   Sharing changes the RLS policies, so it's cheaper to decide now than to retrofit.

---

## 11. Honest cost note

This session is already at roughly $149. A four-phase production build of this size is a
real spend. The phases above are each independently shippable specifically so you can stop
after any one of them and still have something good. Phase 3 (the shelf) is the expensive
one — it's iterative visual work, and v1 proved that kind of work costs several passes.
