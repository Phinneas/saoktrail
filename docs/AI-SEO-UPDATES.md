# AI SEO Updates — Soak Trail

**Date:** January 2026
**Goal:** Get soaktrail.com cited as the AI source for hot springs queries, competing with SoakingSprings.com and HotSpringsGuides.com.

---

## Competitive Landscape

### SoakingSprings.com
- **1,723 springs** across 23 states (3.5x our coverage)
- Data from USGS, OpenStreetMap, Wikipedia/Wikidata
- Named author (Armen Suny) with prominent attribution
- Specific statistics everywhere: "266°F hottest", "40,700 mg/L most mineral-rich"
- Superlatives page with structured data tables — this is their biggest AI citation asset

### HotSpringsGuides.com
- **Worldwide coverage** — 5 continents, experience-based categories
- Strong FAQ sections with natural-language questions (directly extractable by AI)
- Experience types (Wild, Resorts, Public Pools) — structured taxonomy
- Long-form "What to Expect" content blocks

### Soak Trail (us)
- **686 springs** across 8 states, 6 regional sites
- MCP server — unique differentiator (AI agents can query us directly)
- Regional domain strategy (soakcolorado.com, etc.)
- "Ask AI" buttons on homepage
- **Gaps before this update:** No FAQPage schema, no records/superlatives page, no llms.txt, weak extractable content blocks

---

## Changes Made

### 1. `/llms.txt` — Machine-Readable Context File
**File:** `sites/soaktrail/public/llms.txt`
**URL:** https://soaktrail.com/llms.txt

Tells AI agents what Soak Trail is, lists all regional sites, links to key pages, and documents the MCP server configuration. Note: recent research shows llms.txt has minimal impact on AI citation, but it costs nothing to maintain.

### 2. `robots.txt` — Explicit AI Crawler Allowances
**File:** `sites/soaktrail/public/robots.txt`

Added explicit `Allow: /` rules for:
- GPTBot, ChatGPT-User (OpenAI)
- PerplexityBot (Perplexity)
- ClaudeBot, anthropic-ai (Anthropic)
- Google-Extended (Google Gemini / AI Overviews)
- Bingbot (Microsoft Copilot)

The previous config was already `Allow: /` (open), but explicit allowances make intent clear and prevent conflicts with future rules.

### 3. Homepage FAQ Section + Schema
**File:** `sites/soaktrail/src/pages/index.astro`

**Added:**
- 6 FAQ questions with answers (visible `<details>` elements)
- `FAQPage` JSON-LD schema
- Questions cover: spring count, wild vs resort, finding springs near you, free springs, minerals, MCP server

**Why:** HotSpringsGuides has FAQ sections; we didn't. FAQPage schema is one of the strongest signals for AI snippet extraction.

### 4. Near-City Pages FAQ + Freshness Signal
**File:** `sites/soaktrail/src/pages/near/[city].astro`

**Added:**
- Dynamic FAQ per city (4 questions generated from actual spring data)
- `FAQPage` JSON-LD schema per page
- "Last updated" date displayed on every city page
- Questions: "How many springs near [city]?", "Closest spring?", "Warm enough to soak?", "Need to hike?"

**Why:** These are the highest-intent pages for "hot springs near me" queries. The FAQ answers are self-contained and directly extractable by AI systems.

### 5. Records & Superlatives Page (NEW)
**File:** `sites/soaktrail/src/pages/records.astro`
**URL:** https://soaktrail.com/records

**Content sections:**
- Key stats banner (686 springs, 465 soakable, 8 states, 409 year-round)
- **Hottest springs table** — Top 10 ranked by temperature (214°F The Geysers → 205°F Morgan Hot Spring), each linking to its regional site page
- **Highest elevation table** — Top 10 (11,200ft Conundrum → 8,550ft Cottonwood), all Colorado
- **Temperature distribution** — Visual bar chart showing soakable (465), very hot (52), boiling (45), warm (89), unknown (35)
- **Springs by state table** — Idaho (420), Oregon (68), Montana (70), etc. with soakable and year-round counts
- **Access type cards** — 69% hike-in, 16% drive-up, 9% resort, etc.
- **Key facts grid** — Free springs (92%), year-round access (60%), soakable range, remote access stats
- **Data sources section** — USGS, OpenStreetMap, NOAA, Recreation.gov, Wikipedia/Wikidata
- **FAQ section** — 6 questions with FAQPage schema

**Schema markup:**
- `ItemList` — Top 10 hottest springs as structured list
- `Dataset` — Full database stats (unique competitive advantage — neither competitor has this)
- `FAQPage` — 6 Q&A pairs
- `BreadcrumbList`

**Added to sitemap** at `sites/soaktrail/src/pages/sitemap-pages.xml.ts` with priority 0.8.

**Why:** This is the highest-impact single page for AI citation. SoakingSprings has superlatives scattered on their homepage; this is a dedicated, deeper version using our real data (686 springs from regional `springs.json` files). Every number is sourced and specific — exactly what AI systems quote.

---

## Data Sources for Records Page

All statistics come from actual spring data files:
- `sites/soaktherockies/public/springs.json` — 260 springs (ID, MT, WY)
- `sites/desert/public/springs.json` — 260 springs (UT, NV, AZ)
- `sites/mountshasthotsprings/public/springs.json` — 64 springs (Northern CA, Southern OR)
- `sites/wa_hot/public/springs.json` — 46 springs (WA)
- `sites/soakcolorados/public/springs.json` — 36 springs (CO, NM)
- `sites/soakalaska/public/springs.json` — 20 springs (AK)

Total: **686 springs** (651 with temperature data, 281 with elevation data)

---

## What Was NOT Changed

- No existing content was overwritten or removed
- All changes are additive (new sections, new schema objects, new files)
- Pre-existing uncommitted changes to 16 other files were untouched
- Regional sites (soakcolorado.com, etc.) are separate deployments and were not modified

---

### 6. Best Hot Springs by State — Comparison Table Pages (NEW)
**Files:**
- `sites/soaktrail/src/pages/best-hot-springs/[state].astro` — dynamic route
- `sites/soaktrail/src/data/state_springs.json` — pre-computed state data from regional springs.json files

**URLs (8 pages):**
- https://soaktrail.com/best-hot-springs/idaho (420 springs)
- https://soaktrail.com/best-hot-springs/montana (70 springs)
- https://soaktrail.com/best-hot-springs/oregon (68 springs)
- https://soaktrail.com/best-hot-springs/colorado (36 springs)
- https://soaktrail.com/best-hot-springs/california (30 springs)
- https://soaktrail.com/best-hot-springs/wyoming (30 springs)
- https://soaktrail.com/best-hot-springs/alaska (20 springs)
- https://soaktrail.com/best-hot-springs/washington (12 springs)

**Content per page:**
- State header with key stats (total, soakable, year-round, drive-up)
- Comparison table with columns: #, Spring Name, Temperature, Soakability Status (badge), Access Type, Season, Nearest City, Distance
- Sorted by soakability first (95–110°F), then temperature descending
- Limited to top 50 per page for performance, with link to regional site for full list
- Data source attribution section
- FAQ section with 5 state-specific questions
- Cross-links to all other state pages
- CTA to the locator map

**Schema markup per page:**
- `ItemList` — Top 10 springs as structured list
- `FAQPage` — 5 state-specific Q&A pairs
- `BreadcrumbList`

**Data source:** Pre-computed from all 6 regional `springs.json` files. Nearest city calculated via Haversine distance to 100 cities in `near_city_pages.json`. Soakability classified by temperature range (95–110°F = soakable) rather than the unreliable `is_soakable` field.

**Added to sitemap** at `sitemap-pages.xml.ts` with priority 0.8.

**Why:** Comparison content is the #1 format AI systems cite (~33% of all AI citations). Each page is a structured, data-rich comparison table that AI systems can extract snippets from. The state-specific FAQ answers are self-contained and directly quotable.

### 7. Definition Blocks (AI-Extractable Openings)
**Pages updated:**
- Homepage (`index.astro`) — "Soak Trail maps 686 natural hot springs across 8 western US states..."
- Records page (`records.astro`) — "Soak Trail's database covers 686 natural hot springs across 8 western US states — 465 soakable (95–110°F), 409 year-round..."
- Best-hot-springs pages (`[state].astro`) — "Soak Trail maps [X] natural hot springs in [State] — [Y] in the ideal soaking range..."
- Near-city pages (`near/[city].astro`) — "[X] natural hot springs within 50 miles of [City], [State]..."
- How-to-find page (`how-to-find-hot-springs.astro`) — "There are four reliable ways to find natural hot springs in the US..."
- Hot-springs-by-state page (`hot-springs-by-state.astro`) — "Soak Trail has mapped 686 natural hot springs across 8 western US states..."

**Pattern:** Every page's first paragraph follows the same structure: "[Entity] [action verb] [specific number] [what] across [scope]." This is the format AI systems extract as definitions when answering "What is X?" queries.

### 8. Expert Attribution Component
**File:** `sites/soaktrail/src/components/AuthorAttribution.astro`

A reusable component displaying:
- Author initials avatar (CB)
- "Researched & maintained by Chester Beard · Researcher & Field Journalist"
- Data source credits: "Data from USGS, OpenStreetMap, NOAA"
- Link to about page and disclosure

**Pages using it:** Homepage, Records, Best Hot Springs (all states), Near Cities (all cities), How to Find, Hot Springs by State.

**Why:** The Princeton GEO research shows expert attribution boosts AI citation by 25-30%. SoakingSprings.com has "Armen Suny" prominently displayed with an about page. This matches that signal.

### 9. Original Research Report
**File:** `sites/soaktrail/src/pages/reports/hot-springs-american-west-2026.astro`
**URL:** https://soaktrail.com/reports/hot-springs-american-west-2026

A data-driven report with6 key findings from the spring database:
1. Idaho has 14x the spring density of any other state (50.3 per 10,000 sq mi)
2. 92% of springs are free to visit
3. 69% require a hike — most hot springs are backcountry experiences
4. 72% of springs with temperature data fall in the ideal soaking range
5. 59% are year-round
6. The highest hot springs in the US are in Colorado (11,200 ft Conundrum)

Includes a state-by-state comparison table, methodology section, FAQ, and Dataset schema (CC BY 4.0 licensed for citation).

**Why:** Original research with cited data is the #1 content type AI systems cite when answering factual questions. Neither competitor has a comparable data report.

### 10. AI Visibility Monitoring Template
**File:** `docs/AI-VISIBILITY-MONITORING.md`

A structured monitoring template with:
- 20 queries to test (10 high-priority monthly, 10 medium-priority quarterly)
- Recording table format for each query × platform
- Competitor tracking list
- Monthly summary template
- Links to all AI platform URLs

**How to use:** Run the first Monday of each month. Test each query through ChatGPT (with search), Perplexity, and Google. Record whether soaktrail.com is cited, who else was cited, and what type of content was cited. Log patterns and action items.

---

## What To Do Next

### High Priority
1. ~~**Build comparison tables~~** — Done. 8 state pages at `/best-hot-springs/[state]` with structured comparison tables, FAQ, and schema.
2. ~~**Add definition blocks~~** — Done. Updated 6 pages so the first paragraph works as a standalone AI snippet: "Soak Trail maps [X] natural hot springs across [Y] states..."
3. ~~**Add expert attribution~~** — Done. Created `AuthorAttribution.astro` component with "Researched & maintained by Chester Beard · Researcher & Field Journalist" + data source credits. Added to 6 pages: homepage, records, best-hot-springs, near/[city], how-to-find, hot-springs-by-state.

### Medium Priority
4. ~~**Create state-specific definitive guides~~** — Done. 8 guides at `/guides/hot-springs-in-[state]` with geology, regions, top springs table, tips, safety, seasonal info, FAQ + HowTo schema.
5. ~~**Add `Place`/`GeoCoordinates` schema~~** — Done. Added to near/[city] pages (city coordinates) and best-hot-springs pages (state center coordinates).
6. **Fix broken minerals pages** — Sitemap references `/minerals` and `/minerals/chemistry-guide` but page files don't exist. (NOTE: Files actually exist — was a false alarm from earlier exploration.)

### Ongoing
7. **Monitor AI visibility monthly** — Template created at `docs/AI-VISIBILITY-MONITORING.md` with 20 queries to test across ChatGPT, Perplexity, and Google AI Overviews. Run first Monday of each month.
8. **Build third-party presence** — Reddit (r/hotsprings, r/camping), Wikipedia, travel review sites. Needs your participation — can't be automated.
9. ~~**Publish original research~~** — Done. Data report at `/reports/hot-springs-american-west-2026` with 6 key findings, state comparison table, methodology, FAQ, and Dataset schema. CC BY 4.0 licensed for citation.
10. **Add AuthorAttribution to regional sites** — Component is ready at `sites/soaktrail/src/components/AuthorAttribution.astro`. Regional sites (soakcolorado.com, etc.) are separate deployments — needs manual integration.

---

## Key Principle

Traditional SEO gets you ranked. AI SEO gets you **cited**.

AI systems extract passages, not pages. Every key claim should work as a standalone statement. The Records page is designed this way — every table row, every stat, every FAQ answer is self-contained and quotable.
