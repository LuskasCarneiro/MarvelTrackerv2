# Future developments

**Things deliberately not built, kept here so they are not lost and not started by accident.**

Everything in this file is **only on the owner's word, and at the end of the project**
(settled 2026-08-20, `docs/07-the-room.md` Q1). Do not pick an item up because it looks small
or because it would improve a screenshot. Ask first.

---

## Furniture — group (d)

Leather sofas, armchairs, low and side tables, from the reference image `artistic_dir.jpg`.

**Why it is worth doing eventually:** furniture is what gives a room human scale. Without it
the space reads as a showroom rather than somewhere a person sits.

**Why it is deferred:** it encodes none of the archive's data, and it is the most expensive
group per unit of feeling gained.

**What we settled about how it would arrive** (Q11, Q15), so this is drop-in when the time
comes:

| | |
|---|---|
| Format | `.glb` |
| Loader | `useGLTF` from `@react-three/drei` — **already a dependency**, no new package |
| Size | No hard limit. Almost all GLB weight is textures; `gltf-transform` (run via `npx`) typically takes a 6 MB model under 1 MB by resizing textures to 1K and applying Draco. **Do not ask the owner to pre-optimise — compress it here.** |
| Scale | **Do not ask the owner to check.** glTF's spec says 1 unit = 1 metre and exporters routinely lie. Read the bounding box and scale it here. Ask only *what the thing is* — "3-seat sofa" — so a sofa arriving at 2.1cm instead of 2.1m is caught. |
| Origin | Base centre, so it sits on the floor without guesswork |
| Licence | **Required per model.** The repo is public; anything not redistributable cannot be committed |
| Pieces | 1 sofa (placed twice, mirrored), 1 armchair (placed two or three times), 1 low table, 1 side table |
| Rug | **Needs no model** — a textured plane |

**One wrinkle to solve at the same time:** the scene is lit with `MeshPhongMaterial` and has no
environment map, so PBR models will look flat on arrival. The fix is an HDRI, and `PLAN.md` §6
already approves Poly Haven as a CC0 source. Small extra step, not a blocker.

The owner declined to source these on 2026-08-20 ("i wont send them"), so if this is picked up,
pull CC0 pieces from Poly Haven and let the owner veto.

---

## Focal props — group (e)

Statues, Mjölnir, framed original art — the things the reference uses as focal points.

**Explicitly ruled out on 2026-08-20 (Q16): the owner will not supply Marvel props.**

The reasoning, recorded so it is not re-argued from scratch:

- Marvel characters are licensed IP. A "free" model of Wolverine does not change that — the
  uploader cannot license away rights they never held.
- **This repo is public**, so committing one redistributes it, and git history is the awkward
  part to undo.
- The project already carries the same *class* of risk: the shelf ships 152 Marvel poster
  images from TMDB. Props are not a new category, they are more of the same, and the realistic
  worst case for a personal fan archive is a takedown, not a lawsuit.
- The owner weighed that and declined anyway.

**What replaced it**, and why nothing is missing: the room fills with the archive's own
vocabulary instead — film cans and Super-8 reels (geometry we already build for story order),
cases lying flat in stacks, brass bookends, and framed cover art. See `07-the-room.md`, Q20.
**If props are ever revived, they are decoration, not load-bearing** — the room was designed to
be full without them.

---

## Also parked

- **The cover atlas is 3 MB and loads eagerly.** Not a framerate problem — measured at 60fps —
  but it is a ~2s wait on arrival. A loading-experience question, not a performance one.
- **The back cover's top ~15% is dead space**, and its note contrast is unmeasured.
  `scripts/contrast.test.ts` guards DOM colours, not text baked into a texture and then tone
  mapped.
- **Never opened on a phone**, and there is no reduced-motion or no-WebGL path for `/shelf`.
- **Held-to-peek** (`docs/05-3d-shelf.md` §12 Q17) was settled and never built — a held key
  pulls the camera back, replacing the wide toggle.
