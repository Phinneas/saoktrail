## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## regions (read before touching springs data, databases, or site builds)

Each regional site may only list springs from its own states. A build or deploy that breaks this fails on purpose.

| Site folder | Domain | States | Springs D1 database (go by ID) |
|---|---|---|---|
| `sites/desert` | desertsoak.com | UT, NV, AZ | `89215d24-0939-4268-89f0-bfb4d98268b8` |
| `sites/soaktherockies` | soaktherockies.com | ID, MT, WY | `5666d199-3ec6-4076-8401-d96e072d4a17` |
| `sites/soakcolorados` | soakcolorado.com | CO | — |
| `sites/soakalaska` | alaskahotsprings.com | AK | — |
| `sites/mountshasthotsprings` | shastahotsprings.com | CA, OR | — |
| `sites/wa_hot` | washingtonhotsprings.com | WA, OR | — |

Rules:
- **Never copy `public/springs.json`, blog posts, or image data from one site folder to another.** DesertSoak started as a copy of SoakTheRockies and shipped Idaho/Montana/Wyoming springs for months because of this.
- **Cloudflare D1 names are misleading. Use database IDs.** The database NAMED `soaktherockies-db` (`89215d24…`) holds the DESERT springs. The Rockies springs are in `soaktherockies-springs-db` (`5666d199…`), which also holds `blog_posts` for every site.
- **`sites/<site>/public/springs.json` is the only source the site builds from.** There is no build-time fetch. If you change how springs are loaded, keep exactly one source of truth and do not leave a stale copy in git.
- **Do not remove or bypass the region check.** Each site's `build` script runs `scripts/check-site-regions.mjs --site=<site>`. `build-all.sh` and `deploy-all.sh` run it for all sites, and `deploy-all.sh` ends with `--live`, which checks the deployed sites. The allowed states live in `scripts/site-regions.mjs`.
- **When moving or restructuring a site, carry over its `prebuild`/`build` steps and scripts.** The July 2026 move into this monorepo dropped DesertSoak's prebuild data fetch, which is what reintroduced the wrong springs.
- **Deploy only from committed code on `main`.** Do not deploy uncommitted local files.
- The standalone repos (`Phinneas/desert`, `soaktherockies`, `soakcolorados`, `soakalaska`, `mountshasthotsprings`, `wa_hot`) and the `desertsoak-api` Worker are legacy. This monorepo is the only source for the live sites.
- The Asana autoposter (`services/api`) is paused via `AUTOPOSTER_ENABLED = "false"`. Do not re-enable it without the owner asking.
