# Model credits

**⚠️ Incomplete — the owner needs to fill in the source and licence for each of these.**

Three `.glb` models were supplied by the owner on 2026-08-20 and are committed here so the
deployed site can load them. All three were exported by **Sketchfab** (the generator string in
each file says so), and **this repository is public**.

That matters. Most free Sketchfab downloads are **CC-BY**, which permits redistribution *only
with attribution* — and this file is where that attribution has to live. A few are CC0, which
needs nothing. Some are "free download, all rights reserved", which does **not** permit
redistribution at all, and if any of these are that, it should be removed rather than shipped.

`docs/07-the-room.md` Q15 asked for the licence per model precisely because of this, and the
models arrived without it. Nothing here is a judgement about the files; it is simply not
information I can recover from a `.glb`.

| File | Supplied as | Source URL | Author | Licence |
|---|---|---|---|---|
| `sofa.glb` | `old_sofa_free.glb` | **needed** | **needed** | **needed** |
| `rug.glb` | `persian_rug.glb` | **needed** | **needed** | **needed** |
| `puff.glb` | `puff.glb` | **needed** | **needed** | **needed** |

## What was done to them

Supplied at 9.6 MB total and shipped at 1.74 MB, by re-encoding textures to WebP, capping them
at 1024px, and quantising vertex positions:

```
npx @gltf-transform/cli optimize <in>.glb <out>.glb \
  --texture-compress webp --texture-size 1024 --compress quantize
```

**Quantised rather than Draco-compressed on purpose.** Draco fetches a WASM decoder from a CDN,
which this page's content-security policy refuses; quantisation is decoded by three.js itself
with no extra request.

Geometry is unmodified beyond that — no decimation, no re-topology.
