## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## deployment

- The soaktrail website (`sites/soaktrail/`) is a Cloudflare **Pages** project named `saoktrail` (typo — do not rename; Pages names are immutable). It serves `soaktrail.com`.
- Deploy the soaktrail site with `wrangler pages deploy dist --project-name=saoktrail --branch=main` (from `sites/soaktrail/`). Do NOT use `wrangler deploy` for it — that creates a stray assets-only Worker that can't serve SSR (e.g. `/locator`).
- `deploy-all.sh` already handles this correctly (soaktrail entry uses `wrangler pages deploy`).
- The API worker is separate: `soakatlas-mcp.buzzuw2.workers.dev` (deployed from `src/index.ts` via root `wrangler deploy`).
- See DEPLOYMENT.md for full details.
