# Design system

The tokens themselves live in `src/app/globals.css` and that file is the source of truth
for every value. This document holds only what CSS cannot say: the reasoning, the rules
that a linter would not catch, and the decisions a future session must not quietly undo.

Design authority is delegated to Claude (settled by the owner, 2026-08-09). The direction
below is executed from `docs/PLAN.md` §3, not re-invented.

---

## The direction, in one line

**A home-video shelf in a room at night, under a lamp.**

Warm umber ink, never blue-black. Stripe Press is light because a bookshop is light; a
shelf of tapes and discs lives in a living room after dark, so we invert it. The covers do
the glowing and the chrome stays out of the way.

**There is no fixed accent colour.** Each title tints the chrome from its own extracted
artwork palette, so the site's colour is the film's colour. This is the direct translation
of Stripe's per-book `palette` block, and it is also why this design cannot collapse into
either of the two house AI looks — it is neither cream-and-terracotta nor black-with-one-
acid-accent, because the accent is data.

---

## Palette

Six fixed values. Everything else is per-title.

| Token | Value | Role | Contrast on `shelf-dark` |
|---|---|---|---|
| `--color-shelf-dark` | `#14100D` | page ground | — |
| `--color-shelf-raised` | `#1C1713` | case body, raised surfaces | — |
| `--color-shelf-edge` | `#2A231C` | shelf boards, hairlines | — |
| `--color-label-bright` | `#F2EBE1` | primary text | **16.0:1** |
| `--color-label-mid` | `#C8BCAC` | secondary text | **10.1:1** |
| `--color-label-dim` | `#8E8272` | tertiary — **the floor** | **5.0:1** (4.7:1 on raised) |
| `--color-tungsten` | `#E8A94E` | the lamp: focus, live state, light pools | **9.2:1** |

**`--color-label-dim` is the floor and it is deliberately close to it.** 4.7:1 on
`shelf-raised` clears WCAG AA for normal text with very little headroom. Nothing dimmer
than this ships, and any new muted value gets measured, not eyeballed. v1 shipped 2.7:1
body text once because it was judged by eye against a dark background, where everything
looks readable to a person who already knows what it says.

**Tungsten is a light source, not a brand accent.** It is correct for focus rings, live
state and the actual light gradients. It is wrong as a decorative highlight on arbitrary
elements — that job belongs to `--tint`, which changes per title.

### The per-title tint

`--tint` defaults to tungsten so nothing is ever unstyled, and is overridden inline on a
detail page from the palette committed in `data/titles.json`:

```tsx
<article style={{ "--tint": title.palette.bg } as React.CSSProperties}>
```

Tinted surfaces mix rather than replace, so a bright cover never blows out the room:

```css
background: color-mix(in oklab, var(--tint) 12%, var(--color-shelf-raised));
```

The palette is extracted **at build time** and committed. There is no runtime colour
extraction, so there is no flash of untinted chrome and no canvas work on the client.

---

## Type

Two families, both SIL OFL, both self-hosted by `next/font/google` — no request reaches
Google from a user's browser.

| Role | Face | Axes loaded | Why this one |
|---|---|---|---|
| Display, UI, spine labels | **Archivo** | `wght` + **`wdth` 62–125** | It has a real width axis. One family gives compressed spine labels and normal UI text. |
| Body prose — the 152 notes | **Newsreader** | `wght` + **`opsz` 6–72** | Optical sizing, designed for screen reading. Deliberately not Playfair or Cormorant. |
| Data — runtimes, years, counts | Archivo, tabular figures | as above | Numbers in a column must line up. |

**Both `axes` requests are load-bearing and easy to delete by accident.** `next/font`
ships `wght` only unless extra axes are named explicitly. Remove `axes: ['wdth']` and every
spine label silently renders at normal width — it still compiles, still passes types, and
just looks wrong for a reason nothing reports. The same applies to `opsz` on Newsreader.

Two helper classes carry the treatments that Tailwind utilities cannot express — see
`.spine-label` and `.data-figure` in `globals.css`.

---

## Layout — the shelf wall

The DOM layer is **a real design, not a fallback for the 3D**. It has to stand on its own
for crawlers, for no-WebGL, for reduced-motion and for low-power devices, and it has to
still be worth looking at after Phase 3 lands. So it carries the *same encoding* as the
shelf will, at a lower fidelity — not a different idea.

```
┌─────────────────────────────────────────────────────────────┐
│  MARVEL TRACKER                                             │  masthead, one line
│  Every film and series, on the shelf it shipped on.         │
├─────────────────────────────────────────────────────────────┤
│  1986 – 1996          VHS CLAMSHELL              14 titles  │  shelf label (eyebrow)
│  ███ ██ ████ ██ ███████ ██ ████ ███ ██ ████████ ███ ██      │  ← spines, width = runtime
│ ═══════════════════════════════════════════════════════════ │  ← shelf board
│  1997 – 2005          DVD AMARAY                 21 titles  │
│  ████ ███ ██ █████ ███ ████ ██ ███████ ████ ██ ███████      │
│ ═══════════════════════════════════════════════════════════ │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
```

- **Five shelves, in chronological order.** Scrolling down the page moves forward through
  time and the medium changes underfoot: card → plastic → gloss → metal → nothing. That is
  the whole concept, delivered without a single label.
- **Spine width encodes runtime.** Real data, unlabelled, exactly as Stripe encodes page
  count as thickness. Series use episodes × runtime.
- **Spine colour is the title's own extracted palette.**
- Grouping by era also solves the scanning problem that 152 items in one row would create.

A grid of poster cards was rejected: it is what every catalogue does, it throws away the
encoding, and it makes the DOM layer read as a placeholder for the shelf instead of a
sibling of it.

### The detail page is the back of the case

`/title/[slug]` is laid out as a home-video back cover, because a back cover already *is* a
detail view — stills, synopsis, runtime, certification, credits, barcode. That layout was
solved in 1994 and there is no reason to invent a card instead.

```
┌──────────────────────────────────────────┐
│ [ still ] [ still ] [ still ]            │  backdrops, a strip like real box art
├───────────────────────────┬──────────────┤
│ THE SYNOPSIS              │ RUNTIME  126 │  left: the hand-written note, Newsreader
│ the hand-written note,    │ YEAR    2008 │  right: the data block, Archivo tabular
│ set for reading           │ UNIVERSE MCU │
│                           │ CHRONO  2010 │
├───────────────────────────┴──────────────┤
│ ▮▮▯▮▯▯▮▯▮▮▯▮  MARVEL TRACKER ARCHIVE     │  the barcode strip
└──────────────────────────────────────────┘
```

Tinted with that title's palette throughout.

---

## Medium eras — the rule, stated as a rule

The medium is derived from **release year by rule**, not verified per title. `docs/PLAN.md`
says this is a rule and not a caveat, and the UI must never present it as a verified fact
about a specific release.

| Medium | Years |
|---|---|
| `vhs` | ≤ 1996 |
| `amaray` | 1997 – 2005 |
| `bluray` | 2006 – 2012 |
| `steel` | 2013 – 2018 |
| `none` | ≥ 2019 |

> **These ranges deliberately differ from the table in `PLAN.md` §2.** That table has
> overlapping boundaries — 2006 appears in both DVD and Blu-ray, 2013 in both Blu-ray and
> steelbook, 2019 in both steelbook and none — so it cannot be implemented as written. The
> ranges above are the disambiguated version and are the ones the pipeline uses. Do not
> "correct" them back.

Known real-world exceptions (Blade shipped on both VHS and DVD in 1998; several Disney+
titles later got Blu-ray) are handled by an override in the data with a source, never by
bending the rule.

---

## Motion budget

One orchestrated moment, and nothing else. On first load the shelf light pools fade up in
sequence from the top shelf down — a shop's lights coming on — over roughly 600 ms total.
Hover and focus lift a spine a few pixels and bleed its tint into the surrounding light.

That is the entire budget. Scattered micro-animations are the single clearest tell of a
generated design, and this one earns its keep by being about the subject.

`prefers-reduced-motion: reduce` is honoured by a blanket rule in `globals.css` that
neutralises every animation and transition. It is deliberately blunt so that a new
component cannot forget to opt in.

---

## Quality floor

Not negotiable, and checked rather than asserted:

- Responsive down to mobile.
- Visible keyboard focus everywhere — tungsten, never the browser default, never `none`.
- `prefers-reduced-motion` honoured.
- WCAG AA contrast, measured in CI.
- Spine labels are `<a>` elements with a proper accessible name. The vertical, compressed,
  uppercase rendering is presentational; assistive technology gets the plain title.

## Deliberately not done

- **No light mode.** The direction is a room at night. A light variant would be a different
  design, not a theme of this one, and supporting both would halve the attention each gets.
  The scaffold's `prefers-color-scheme` block was removed for this reason.
