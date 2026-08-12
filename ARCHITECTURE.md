# Soak Trail Architecture

## Monorepo Structure

```
soaktrail/
├── sites/                      # 7 Astro sites (Cloudflare Pages/Workers)
│   ├── desert/                 # desertsoak.com (UT/NV/AZ)
│   ├── soakcolorados/          # soakcolorado.com (CO/NM)
│   ├── soaktherockies/        # soaktherockies.com (ID/MT/WY)
│   ├── soakalaska/             # alaskahotsprings.com (AK)
│   ├── mountshasthotsprings/   # shastahotsprings.com (CA/OR)
│   ├── wa_hot/                 # washingtonhotsprings.com (WA)
│   └── soaktrail/              # soaktrail.com (hub + trip-planner + minerals)
├── packages/shared/            # Shared components, libs, types, config
│   └── src/
│       ├── components/         # BaseLayout, blog layouts, search, etc.
│       ├── lib/                # d1Blog, mergedBlog, sortFunctions, etc.
│       ├── config/             # SiteConfig interface
│       └── types/              # Shared TypeScript types
├── services/api/               # Cloudflare Worker: D1 API + auto-poster
│   └── src/
│       ├── routes.ts           # REST API endpoints (blog, springs, minerals, admin)
│       ├── scheduler.ts        # Asana → MiniMax → D1 auto-posting pipeline
│       └── resolvers.ts        # GraphQL resolvers
├── services/data/              # Data files (spring-chemistry.json, blog queue)
├── shop/                       # Shop site (shop.soaktrail.com)
├── build-all.sh                # Builds all 7 sites (used by pre-push hook)
└── .githooks/pre-push           # Runs build-all.sh before git push
```

## Blog Content Flow

```
Asana Tasks → MiniMax (generate) → Humanizer (second pass) → D1 database → Sites (SSR fetch)
```

1. **Asana**: 4 projects (one per regional site) contain blog post briefs as tasks
2. **Scheduler** (`services/api/src/scheduler.ts`): Runs on cron (Mon/Thu 06:00 UTC)
   - Reads open tasks from each Asana project
   - Generates blog post with MiniMax API
   - Humanizes the body (strips AI-writing patterns)
   - Fetches featured image from Pexels
   - Inserts into D1 `blog_posts` table with `site` tag
   - Marks Asana task complete
3. **D1 API** (`services/api/src/routes.ts`): Serves blog posts via REST API
   - `GET /api/blog?site=<slug>&limit=N` — list posts for a site
   - `GET /api/blog/<slug>?site=<slug>` — get single post
4. **Sites**: Each regional site fetches from the D1 API at request time (SSR)
   - `getMergedBlogEntries()` merges local MDX posts with D1 API posts
   - Falls back to local posts if D1 API is unreachable (try/catch)

### Adding a New Site to the Auto-Poster

1. Create an Asana project for the new site
2. Add the project GID as a Worker secret: `wrangler secret put ASANA_PROJECT_<SITENAME>`
3. Add the site to the `sites` array in `services/api/src/scheduler.ts`
4. Add the site slug to the `siteSlug` field in the site's `site.config.ts`
5. Update the asana-check endpoint in `routes.ts` to include the new project

## Springs Data Flow

```
D1 databases (6 regional) → MCP Worker (soakatlas-mcp) → Trip-planner + Regional sites
```

- **6 D1 databases**: One per region (DB_DESERT, DB_ROCKIES, DB_COLORADO, DB_SHASTA, DB_WASHINGTON, DB_ALASKA)
- **MCP Worker** (`sites/soaktrail/src/index.ts`): Exposes springs data via MCP JSON-RPC protocol
  - `get_hotsprings_by_region` — list springs for a region
  - `search_hotsprings` — search/filter springs
  - `get_hotspring_details` — get single spring by slug
- **Trip-planner** (`soaktrail.com/trip-planner`): Fetches from MCP API, links to regional site detail pages
- **Regional sites**: Each has `public/springs.json` (build-time export from D1) and `/springs/[slug]` SSR route

### Known Issue: Slug Mismatch

The MCP API (D1) and the regional sites' `springs.json` use different slug conventions for 3 of 6 regions:

| Region | Match | Status |
|--------|-------|--------|
| shasta | 50/50 | Works |
| rockies | 50/50 | Works |
| washington | 46/46 | Works |
| desert | 2/50 | Broken (48 would 404) |
| colorado | 27/46 | Partially broken |
| alaska | 0/7 | All broken |

**Fix approach**: Improve MCP/D1 data to be the canonical source, then make all sites draw from MCP.

## Trip-Planner Flow

```
soaktrail.com/trip-planner → Region page → Regional site /springs/<slug>
```

1. `/trip-planner` — Lists 6 regions (Washington, Alaska, Shasta, Colorado, Rockies, Desert)
2. `/trip-planner/[region]` — Fetches springs from MCP API, displays spring cards
3. Each spring card links to `childSite/springs/<slug>` (e.g., `shastahotsprings.com/springs/the-geysers`)
4. Non-soakable springs (geothermal fields, geysers) are filtered out

## Site Config Structure

Each site has a `site.config.ts` implementing the `SiteConfig` interface from `packages/shared/src/config/site-config.ts`:

```typescript
export const siteConfig: SiteConfig = {
  name: "Soak Colorado",
  url: "https://www.soakcolorado.com",
  description: "...",
  author: "Soak Colorado",
  ogImage: "/og-image.png",
  nav: [...],
  mapUrl: "/colorado-hot-springs-map",
  social: { instagram: "...", pinterest: "..." },
  shares: { bluesky: true, threads: true, facebook: true },
  colors: { accent: "...", text: {...}, bg: {...}, border: "..." },
  fontScale: 1.25,
  navFontClass: "font-secondary",
  siteSlug: "soakcolorado",  // D1 blog content filter
  sameAs: [...],  // Schema.org social profiles
  region: "CO",
};
```

## Build Process

### Building a single site
```bash
cd sites/<site-name>
npm run build          # Astro build (catches SSR errors)
npm run typecheck      # astro check (TypeScript type checking, requires TS 5.x)
```

### Building all sites
```bash
./build-all.sh         # Builds all 7 sites, exits non-zero on failure
```

### Pre-push hook
The `.githooks/pre-push` hook runs `build-all.sh` before allowing a push. If any site fails to build, the push is blocked.

To install the hook (done automatically):
```bash
git config core.hooksPath .githooks
```

### TypeScript Note
`astro check` requires TypeScript 5.x or 6.x. TypeScript 7.0+ does not expose the programmatic API that `astro check` relies on. All sites are pinned to TypeScript 5.x.

## Key Libraries

- **Astro 5.18** — SSR framework with Cloudflare adapter
- **Hono** — API router (services/api)
- **MiniMax M2.7** — Blog post generation
- **Pexels** — Featured image lookup
- **Asana API** — Task management for blog briefs
- **Graphify** — Codebase knowledge graph (run `graphify build .` to generate)

## Important Files

| File | Purpose |
|------|---------|
| `services/api/src/scheduler.ts` | Auto-poster: Asana → MiniMax → D1 |
| `services/api/src/routes.ts` | REST API: blog, springs, minerals, admin endpoints |
| `services/api/lib/asana.js` | Asana API client (listOpenTasks, markTaskComplete) |
| `services/api/lib/minimax.js` | MiniMax API client (generateBlogPost, humanizeBody) |
| `packages/shared/src/lib/mergedBlog.ts` | Merges local MDX + D1 blog entries (try/catch) |
| `packages/shared/src/lib/d1Blog.ts` | D1 API client for blog posts |
| `packages/shared/src/config/site-config.ts` | SiteConfig interface definition |
| `sites/soaktrail/src/index.ts` | SoakAtlas MCP Worker (springs data via JSON-RPC) |
| `sites/soaktrail/src/lib/regions.ts` | Trip-planner region definitions (6 regions) |
| `sites/soaktrail/src/lib/mcp.ts` | MCP API client (getSpringsByRegion, searchSprings) |
