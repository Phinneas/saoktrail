# US Hot Springs by the Numbers — Design

**Date:** 2026-08-31
**Status:** Approved approach (A: build-time pipeline + prerendered page)
**Owner:** soaktrail.com

## Goal

Publish a citable, linkable annual data asset at
`https://soaktrail.com/reports/us-hot-springs-by-the-numbers` — rankings and
statistics computed from the SoakTrail dataset (515 springs, 6 regional D1
databases), refreshed annually at the same canonical URL ("2026 Edition" label
in the title, updated in place each year).

Secondary goal: enrich the D1 databases with the derived fields (elevation,
distance-to-town, soakability/safety classification) so other surfaces
(locator, trip-planner) benefit.

## Non-goals (out of scope)

- OSM/Wikipedia/USGS cross-referencing of safety data (later enhancement).
- Live/SSR data fetching for the report page — it is a static snapshot.
- Per-pool temperature measurements (we only have source temps).
- Fixing the corrupt National Park woff2 files in child sites (soaktrail's are
  already fixed; child sites are a separate task).

## Data sources

| Source | Used for | Access |
|---|---|---|
| 6 regional D1 DBs (`desertsoak-db`, `soaktherockies-springs-db`, `soakcolorado-springs-db`, `shastahotsprings-db`, `washingtonhotsprings-db`, `alaskahotsprings-db`) | spring rows: name, slug, lat/lon, state, region, temperature_f, development, access_type, fees, fee_amount_usd, description | `wrangler d1 execute <db> --remote --json` (subprocess) |
| `data/uscities.csv` (SimpleMaps) | remoteness: nearest place with population ≥ 1,000 | local file |
| USGS EPQS (`https://epqs.nationalmap.gov/v1/json?x={lon}&y={lat}&units=Feet&wkid=4326&includeDate=False`) | elevation_ft | HTTP, free, no key, cached to `data/elevation_cache.json` |

Known data reality (verified 2026-08-31): `temperature_f` populated for ~96% of
springs; `elevation_ft` and `distance_to_town_mi` are empty in all six DBs and
will be backfilled by this pipeline.

## Pipeline: `scripts/build_by_the_numbers.py`

Run with `uv run scripts/build_by_the_numbers.py` (repo convention). Steps:

1. **Fetch** all springs from each of the 6 D1 DBs via
   `wrangler d1 execute <db> --remote --command "SELECT ..." --json`
   (needed columns incl. `description` — the public API list endpoint doesn't
   expose it).
2. **Derive elevation** for every spring from USGS EPQS. Cache results in
   `data/elevation_cache.json` keyed by rounded lat/lon so re-runs are cheap
   and annual refreshes only fetch new springs. Polite: sequential requests,
   short sleep.
3. **Derive remoteness**: for each spring, haversine distance to the nearest
   place in `uscities.csv` with population ≥ 1,000 → `distance_to_town_mi` +
   `nearby_town`.
4. **Classify soakability/safety** per spring (rules below) → `soakable`,
   `safety_notes`.
5. **Compute report data**: rankings + aggregate stats (below).
6. **Write outputs**:
   - `sites/soaktrail/src/data/by_the_numbers.json` — everything the page needs
     (rankings, stats, per-spring rows, `generated_at` date).
   - `sites/soaktrail/public/data/us-hot-springs-by-the-numbers.csv` — flat CSV
     of all ranked springs for download/citation.
   - `migrations/out/007_backfill_<db>.sql` per DB — UPDATE statements for
     `elevation_ft`, `distance_to_town_mi`, `nearby_town`, `soakable`,
     `safety_notes` (printed with apply instructions; applied manually via
     `wrangler d1 execute <db> --remote --file ...`).

## D1 migration: `007_report_enrichment.sql`

Adds two columns to the unified `springs` schema (elevation_ft,
distance_to_town_mi, nearby_town already exist):

```sql
ALTER TABLE springs ADD COLUMN soakable TEXT DEFAULT 'unknown';
ALTER TABLE springs ADD COLUMN safety_notes TEXT;
```

Applied to all 6 regional DBs. After migration, the pipeline's backfill SQL
populates them. (`soakable` values: `soakable`, `caution`, `too_hot`,
`not_soakable`, `unknown`.)

## Safety classification rules (v1, rule-based)

Evaluated in order; first match wins:

| # | Condition | Classification | safety_notes |
|---|---|---|---|
| 1 | `access_type` or `description` contains "not soakable" / "not a soaking" / "not recommended for soaking" | `not_soakable` | "Listed as a geothermal feature, not a soaking site. Do not enter the water." |
| 2 | `temperature_f` ≥ 120 and `development` = 'primitive' | `too_hot` | "Source temperature {t}°F can scald in minutes. Water may cool downstream — verify pool temperature before entering." |
| 3 | `temperature_f` ≥ 120 and `development` in ('resort','developed') | `soakable` | "Source water emerges at {t}°F; soaking pools are cooled/managed. Follow posted guidance on site." |
| 4 | `temperature_f` 110–119 and `development` = 'primitive' | `caution` | "Source temperature {t}°F is at or above safe soaking limits. Test carefully before entering." |
| 5 | `temperature_f` present, otherwise | `soakable` | — |
| 6 | no temperature data | `unknown` | — |

Rationale: sustained soaking is unsafe above ~110°F; ≥120°F scalds within
minutes. Resorts/developed sites with hot sources manage pool temps, so they
stay soakable with a note.

## Report content

Sections (each with an HTML anchor, in page order):

1. **Headline stats** — total springs, regions, states, temperature range,
   % with temperature data, data-as-of date.
2. **Hottest soakable springs** (top 20) — `soakable` in
   (soakable, caution), ranked by temperature_f.
3. **Hottest recorded sources** (top 20) — all springs ranked by temperature_f;
   non-soakable rows carry an inline ⚠ caution. Section intro states clearly:
   source temperature, not pool temperature.
4. **Highest-elevation springs** (top 20) — ranked by derived elevation_ft.
5. **Most remote springs** (top 20) — ranked by derived distance_to_town_mi;
   tie-break: hike/boat access before drive-up.
6. **Resort vs. primitive** — counts by `development` class (resort /
   developed / primitive), share with fees, average fee where known, average
   temperature per class, per-region breakdown table.
7. **By state** — spring count and hottest spring per state.
8. **Methodology** — data sources, derivation methods, safety rules (the table
   above, verbatim), population threshold, limitations.
9. **Soaking safety** — standing cautionary section: source vs. pool temps,
   scald thresholds, "always test the water", not-soakable features exist in
   the dataset.
10. **Cite this report** — APA-style and plain-text citation blocks with the
    canonical URL and edition year; link to the CSV.

Every spring row in every table deep-links to
`{child_site}/springs/{slug}` (existing convention).

## Page implementation

- `sites/soaktrail/src/pages/reports/us-hot-springs-by-the-numbers.astro` —
  `export const prerender = true`, imports the JSON at build time. Title:
  "US Hot Springs by the Numbers: 2026 Annual Report". Edition year comes from
  the JSON (`edition` field), not hardcoded.
- JSON-LD: `Dataset` (with `temporalCoverage`, `spatialCoverage`,
  `distribution` pointing at the CSV) + `BreadcrumbList`.
- CSV at `/data/us-hot-springs-by-the-numbers.csv` (stable, unversioned URL so
  citations don't rot; contents refreshed annually).
- Styling follows existing soaktrail conventions (Tailwind, `sa-*` palette,
  National Park display / Fraunces body, same table/card patterns as
  `/near/[city]` pages).

## Annual refresh procedure

1. `uv run scripts/build_by_the_numbers.py` (re-fetches D1, only new springs
   hit EPQS thanks to the cache).
2. Apply backfill SQL per DB if new springs were added.
3. `cd sites/soaktrail && npm run build && npx wrangler pages deploy dist --project-name=saoktrail --branch=main`.

## Error handling

- EPQS failure for a coordinate: log, mark elevation null, continue; report
  shows "elevation data pending" count if >0.
- Missing/empty D1 response for a region: hard fail (script exits non-zero) —
  a silently incomplete dataset would corrupt a citation asset.
- Springs lacking lat/lon: excluded from elevation/remoteness, counted in
  methodology notes.

## Verification

- Script prints summary counts (per DB, per classification) for eyeball check.
- `npm run build` in `sites/soaktrail` succeeds; page prerenders.
- Manual check of built HTML: anchors, ⚠ markers on non-soakable rows,
  citation block, CSV link works.
- Backfill SQL applied to one DB first, spot-checked with a SELECT, then the
  rest.
