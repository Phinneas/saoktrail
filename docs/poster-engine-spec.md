# SoakTrail Poster Engine — Diagnosis & Rebuild Spec

**Status:** Draft for review
**Scope:** `/shop` (poster studio + checkout + fulfillment) and its two render backends
**Goal:** figure out why the current posters look amateurish, and spec a version good enough that a stranger would pay $25–$45 to hang it on a wall

---

## 1. TL;DR

The poster you sell today is **not the map the customer designs.** The Studio preview renders a nice interactive MapLibre map in the browser. At checkout, a completely different, much cruder pipeline re-renders the poster from scratch: it downloads pre-styled **raster** tiles from Thunderforest, glues them together like a photo collage, and draws text on top with SVG. That pipeline can't change the basemap's colors, road styling, or label size — it can only composite on top of it — because raster tiles arrive as finished pixels, not map data. That's the whole "not sure how to improve the look" problem in one sentence: **you're not styling a map, you're decorating a screenshot of someone else's map.**

Three compounding issues on top of that:

1. **Preview ≠ product.** What the customer zooms/pans to in the Studio is discarded; checkout always re-renders the original spring's default framing at a fixed zoom. The customer can't actually compose their poster.
2. **Trails are OSM guesses, not the user's hike.** The pitch is "show the trail you walked," but the code queries OpenStreetMap for any `path|footway|track` within 2 km of the pin — not a GPS track of an actual hike. For springs with no mapped OSM trail, there's no trail line at all.
3. **Resolution is low for the size sold.** 18×24″ prints render at ~150 DPI. That's passable for some POD vendors but well under the 300 DPI standard for premium wall art, and it's the reason things can look soft even before typography is considered.

The fix isn't "pick nicer colors." It's a rendering-architecture change: move to vector-tile-based rendering with a style file you own, so text, roads, water, and trails are all things you can actually design — and make that same style file drive both the live preview and the purchased file, so what customers design is what they get.

---

## 2. What's actually deployed today (verified in code)

### 2.1 Two render backends exist; only one is live

| Path | Runtime | Status |
|---|---|---|
| `services/render/` (Cloudflare Worker, `soaktrail-render.workers.dev`) | Workers + `resvg-wasm` | **Live** — `shop/wrangler.toml` points `RENDER_SERVICE_URL` here |
| `render-service/` (Fly.io app `soaktrail-render`, Node + `sharp`) | Fly.io, `min_machines_running=1` (already paid for / kept warm) | **Built but currently unused** — nothing points to it |

This matters a lot for the plan below: **you already have a persistent server (Fly.io) provisioned and running, sitting idle.** That's the compute you need for real vector rendering — Cloudflare Workers can't run the native rendering libraries (headless GL, Python/matplotlib, etc.) that produce good cartography, which is *why* the Workers path was forced into the raster-tile-collage hack in the first place.

### 2.2 The live render pipeline (`services/render/src/{tiles,poster}.ts`)

1. `tiles.ts` fetches a grid of pre-rendered Thunderforest **raster** tiles (`outdoors`, `transport-dark`, `landscape` — one per style) at a fixed zoom.
2. `poster.ts` pastes those tile images into an SVG `<image>` grid, draws the trail (if any OSM data was found) as a dashed path on top, draws a circle marker, and draws the text footer — all as SVG shapes.
3. `resvg-wasm` rasterizes that SVG to PNG.

Because step 1 is finished pixels, step 2 can only draw *on top of* whatever Thunderforest already baked in — its road colors, its label choices, its font, its label density at that zoom. You cannot boost contrast on a road label, hide a layer you don't want, recolor water, or make a town name bigger. That control simply doesn't exist in a raster tile.

Print sizes (`POSTER_DIMS` in `poster.ts`):

| Size | Pixels | Effective DPI |
|---|---|---|
| digital | 1800 × 2700 | — (same file as 12×18) |
| 12×18″ | 1800 × 2700 | 150 |
| 18×24″ | 2700 × 3600 | 150 |

"Digital" and "12×18" are literally the same render — no size-appropriate framing or resolution differentiation.

### 2.3 The Studio preview (`shop/src/components/PosterStudio.svelte`)

This is the nicer half of the product and it's client-side only:

- Uses real **MapLibre GL JS** with either Thunderforest raster tiles (topo style) or OpenFreeMap **vector** styles (`liberty`/`dark`/`positron`, for midnight/minimal) — so the preview for two of your three styles is a genuine vector render, and looks meaningfully better than what actually gets sold.
- Pulls trail geometry client-side from the public Overpass API (`around:2000` meters of the pin — any tagged path/footway/track, not a specific hike) and overlays it as a MapLibre line layer.
- Zoom is auto-set once from the spring's `access_type` (`hike` → 13, `dirt/4wd` → 12, else → 11) and **never updates from user interaction.** There's no `map.on('move'/'zoom', …)` listener, so scrolling/panning the preview changes what's on screen but not `mapZoom`, which is what actually gets sent to checkout.

### 2.4 Checkout → render handoff (`shop/src/pages/api/{checkout,webhook}.ts`)

`handleBuy()` in the Studio posts `springLat`, `springLng`, the *original* auto-computed `zoom`, and the Overpass `trailData` it happened to cache on mount. The webhook later calls the render service with those exact values. **Whatever the customer did in the interactive preview — recentering, zooming in on a specific ridge, scrolling to a better crop — is thrown away.** The purchased poster is always the default framing.

### 2.5 An earlier, unbuilt spec already explored the right direction

`soaktrail_spec_v3 (2).md` (root of repo) is a prior plan — never implemented — proposing a Python/FastAPI service using OSMnx + Matplotlib (via a fork of the OSS `maptoposter` project) to pull real OSM vector data, plot it with a controllable theme JSON, overlay a GPX track, and export at true 300 DPI. It's not what got built (the live stack is Astro/Svelte/Cloudflare, not Python), but it correctly diagnosed the core requirement: **you need the underlying map *data*, not a picture of a map, to control how it looks.** The spec below reaches a similar conclusion via a different (and I think better-fitted-to-your-stack) engine — see §4.2.

### 2.6 Correcting one assumption in your message

You said you're "as far as I know" on Mapbox, like Maptoposter/Terraink. **The live purchased poster is on Thunderforest raster tiles, not Mapbox.** Mapbox code exists (`render-service/src/render.ts`, the unused Fly.io path) but nothing calls it. Thunderforest doesn't offer vector tiles at all — it's a raster-only provider — so even switching the *live* Worker fully onto Thunderforest properly wouldn't unlock styling control. This is a provider decision as much as an engine decision (see §4.3).

---

## 3. What "good" looks like (competitive grounding)

Products in this exact category (Mapiful, Grafomap, Mappic, and presumably Terraink/the old MapToPoster) get crisp, restylable output because they render from **vector map data + a style/theme they own**, at export resolution, rather than compositing pre-baked tiles:

- Mappic explicitly sells "high-resolution vector PDF... 300 DPI vector map for large wall art" — vector data means the export is sharp at *any* size, with no tile-seam or resolution ceiling.
- Mapbox's own static-image APIs cap out at 1280×1280 px and warn that raster tile stitching causes **cut-off labels at tile boundaries** — the exact seam/label problem your current pipeline has, coming from the same root cause (compositing independently-rendered tiles instead of rendering the whole canvas as one scene).
- The standard tool for "I want a controllable map style rendered server-side at high resolution" is a **headless MapLibre/Mapbox GL renderer** (e.g. `mbgl-renderer`, `@maplibre/maplibre-gl-native`) — it takes the *same* style JSON your interactive map uses, renders it once at whatever pixel size you ask for (no 1280px cap, no per-tile seams, labels placed correctly across the whole canvas), and can overlay arbitrary GeoJSON (a trail!) natively.

That last point is the piece your architecture is missing, and it's the one to build toward.

---

## 4. Target architecture

### 4.1 One style, two renderers, zero drift

Define your three looks (`soaktrail-topo`, `soaktrail-midnight`, `soaktrail-minimal`) as **MapLibre style JSON you own** — real cartography rules: which layers exist, their colors, road casing widths, label font/size/halo, minzoom for labels, water fill, etc. (`render-service/src/styles/*.json` already has a skeleton of this — it's just not wired to anything live.)

- **Preview** (Studio, browser): MapLibre GL JS loads this exact style over a vector tile source. This already mostly works today for the midnight/minimal styles via OpenFreeMap; extend it to all three and to the trail/marker overlays.
- **Final render** (Fly.io box, currently idle): a **headless MapLibre renderer** (`mbgl-renderer` or hand-rolled `@maplibre/maplibre-gl-native` + `sharp`) loads the *same* style JSON and the *same* vector tile source, renders at true print pixel dimensions in one pass (no tile grid, no seams), and composites your GeoJSON trail/trailhead/marker/title layers using MapLibre's own GeoJSON-source support (so trail line styling is one more layer in the style, not a separate hand-drawn SVG path).

This single change fixes the biggest complaint for free: **what the customer designs is what gets printed**, because it's the same style and (once §4.5 is fixed) the same camera.

### 4.2 Why this over the Python/OSMnx/Matplotlib path from the old spec

Both approaches solve "get real map data instead of raster pixels." The Matplotlib path is proven and can look great, but it's a second, disconnected rendering stack from your JS preview — you'd be styling two different renderers (Matplotlib theme JSON vs. MapLibre style) and would drift again over time, just at a slower rate. The MapLibre-native path reuses the exact engine already running in the browser, so there is structurally only one place to make the map look better. Recommend MapLibre-native; keep the old spec as a documented fallback if the native bindings prove painful to run on Fly.io.

### 4.3 Vector tile source (you have to pick one — Thunderforest doesn't offer this)

| Option | Cost | Notes |
|---|---|---|
| MapTiler Cloud | Paid, usage-based | OpenMapTiles schema, hillshade/contour tiles available, easiest to start |
| Stadia Maps | Paid, usage-based | Similar to MapTiler, good outdoor styles as a reference |
| Self-hosted Protomaps (PMTiles) | ~Free (R2/object storage + planetiler build) | You only ever need coverage for ~12 western states — a single regional PMTiles extract is small and can sit in R2, served straight to both the Worker (for preview, if you keep a thin proxy) and the Fly.io renderer. Best unit economics at your scale; more setup work upfront. |

Recommendation: start on MapTiler (fast to integrate, get the pipeline proven), and revisit self-hosted Protomaps once volume justifies owning the tile layer — the geographic footprint is small and static, which is exactly the case self-hosting is good at.

### 4.4 Real trails, not nearby-path guesses

Two tracks, not mutually exclusive:

- **v1 fix (cheap):** widen/adapt the Overpass query per `access_type` instead of a flat 2 km radius (a real hike-in spring's trail may run longer than 2 km one-way), and prefer a way that's tagged/named consistently toward the known trailhead over "everything path-like nearby." Still a guess, but a better one.
- **v2 (matches the actual pitch):** let a user attach the real route — GPX upload, or a pasted AllTrails link. This session has an AllTrails MCP tool available (`find_trails_near_location`, `get_trail_details`, etc.) that could resolve a trail by name/location server-side without the user needing a GPX file at all — worth prototyping as the "show the trail you walked" feature actually promised in your pitch, rather than an OSM heuristic standing in for it.

### 4.5 Fix preview → checkout parity (small, high-value fix, independent of the engine rewrite)

Track `center`/`zoom`/`bearing` live off the MapLibre `move`/`zoom` events in `PosterStudio.svelte`, and send that (not the static `mapZoom` computed once at mount) through `handleBuy()` → checkout → webhook → render. This alone lets customers "zoom closer to see the typography and roads more clearly," as you asked for, without touching the render engine at all — and it means the preview stops lying about the product.

### 4.6 Print resolution

Move to true 300 DPI and give "digital" its own honest size instead of reusing the 12×18 file:

| Size | Pixels @ 300 DPI |
|---|---|
| Digital download | 3600 × 5400 (equivalent to 12×18, sized for home printing) |
| 12×18″ | 3600 × 5400 |
| 18×24″ | 5400 × 7200 |

Vector rendering makes this cheap to raise — unlike raster tiles, text and lines are drawn crisp at whatever pixel density you export to; you're not upscaling a fixed-resolution source image.

### 4.7 Cartography & typography checklist (the actual "make it look sellable" list)

- **Label halo/contrast:** every label (town names, road names, peak names) gets a white/dark halo sized relative to font weight so text stays legible over both light terrain and water — this is a one-line style property, not achievable at all in the raster path today.
- **Independent label density from zoom:** vector rendering lets you decouple "how much area is shown" from "how much label detail appears" (e.g. force minor road names to render even at a zoom where the stock style would hide them) — directly answers your "typography more readily obvious" ask.
- **Road hierarchy:** distinct casing/width/color for highway → local road → trail, so a "drive to the trailhead" poster reads clearly at a glance.
- **Water contrast:** deliberate fill color with enough contrast against land fill (current raster water color is whatever Thunderforest shipped).
- **Optional hillshade/contour layer:** most vector sources (MapTiler, Stadia) offer a hillshade or contour tile source you can drop in as a layer — this is the single highest-impact "premium topo poster" visual cue and is currently entirely absent.
- **Trail line treatment:** distinct from roads — bolder, dashed, single accent color, always rendered above roads/water; trailhead marker as a separate glyph from the spring pin.
- **Frame/mat elements:** north arrow, scale bar, and a border/mat around the map area — cheap additions that read as "real cartography" rather than "screenshot with text," and are standard on every competitor product referenced above.

### 4.8 Two explicit poster modes (matches your two spring types)

- **Trail Mode** (hike-in springs): tighter zoom, trail line as the hero element, trailhead-to-spring distance/elevation gain as a stat line in the footer if a real track is available.
- **Area Mode** (drive-to springs): wider zoom, road hierarchy and place labels as the hero element, no trail line, footer emphasizes access info instead of trail stats.

`access_type` already exists on spring records and partially drives zoom today — extend it to drive which layers/labels get emphasis, not just how far zoomed in.

---

## 5. Migration plan

1. **Parity fix first** (§4.5) — cheapest, highest trust win, no architecture change. Do this regardless of anything else.
2. **Stand up the style JSON** for all three looks against a chosen vector source (§4.3) and get the Studio preview rendering all three as real vector maps (topo currently falls back to raster Thunderforest — bring it in line with midnight/minimal).
3. **Build the headless renderer on the already-running Fly.io box**, sharing the style JSON from step 2. Cut `RENDER_SERVICE_URL` over once it's producing output at parity with preview.
4. **Raise print resolution** to true 300 DPI (§4.6) and give digital its own size.
5. **Add hillshade + frame elements** (§4.7) — visual polish pass once the pipeline is real.
6. **Trail data v2** (§4.4) — GPX/AllTrails ingestion, once the rest of the pipeline can actually do a real track justice.
7. Retire or repurpose the dead `render-service/` (Fly.io/`sharp`/Mapbox-raster) code — it's not the target architecture, and having two half-built render paths in the repo is itself a source of confusion (I initially had to trace which one was even live).

---

## 6. Open decisions (need your call before implementation)

- **Vector tile budget:** MapTiler/Stadia (fast, ongoing cost) vs. self-hosted Protomaps (cheaper long-run, more upfront work). Given your footprint is ~12 fixed states, self-hosting is unusually well-suited here — but it's more work to stand up first.
- **Trail data ambition for v1:** ship the parity fix + better cartography now with the existing OSM-heuristic trail, or hold the trail line feature until GPX/AllTrails ingestion is ready so you're not selling "your trail" when it's actually "a nearby OSM path"?
- **Digital file policy:** now that "digital" and "12×18" won't accidentally be the same file, do you want digital sized/priced as its own tier, or explicitly framed as "get the 12×18 file to print at home"?

---

## 7. File map (for whoever implements this)

```
shop/src/components/PosterStudio.svelte   – Studio preview (MapLibre GL JS, client-side)
shop/src/pages/studio/[slug].astro        – Studio page, passes Thunderforest key only
shop/src/pages/api/checkout.ts            – creates poster + Stripe session
shop/src/pages/api/webhook.ts             – on payment: calls RENDER_SERVICE_URL, uploads to R2, submits Gelato print orders
shop/wrangler.toml                        – RENDER_SERVICE_URL currently points at services/render (live)

services/render/src/{index,tiles,poster}.ts – LIVE render backend: Thunderforest raster tiles + resvg-wasm SVG compositing
services/render/src/styles/*.json           – (n/a today — style control doesn't exist in this raster pipeline)

render-service/                            – UNUSED Fly.io/Node/sharp backend (Mapbox raster or Thunderforest raster + tile stitching)
render-service/fly.toml                    – already provisioned, min_machines_running=1, good target for the new headless renderer

soaktrail_spec_v3 (2).md                   – prior unbuilt spec (Python/OSMnx/Matplotlib approach) — useful reference, not the recommended path
```
