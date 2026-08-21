# Asana-Driven Auto-Posting System — Handoff Spec

## What This System Does

A Cloudflare Worker runs on a cron schedule (Mon/Thu 06:00 UTC). For each "site" (regional website), it:
1. Fetches the first open (incomplete) task from a dedicated Asana project
2. Sends the task name + notes to MiniMax (LLM) to generate a long-form blog post
3. Runs a second "Humanizer" LLM pass to strip AI-writing patterns from the body
4. Fetches a featured image from Pexels (optional)
5. Saves the post to Cloudflare D1 (SQLite) with `site` tag + `asana_task_gid`
6. Marks the Asana task complete so it's never processed again

A manual trigger endpoint (`POST /api/admin/trigger-scheduler`) runs the same flow on demand.

## Architecture

```
Asana Project (per site)
    ↓ listOpenTasks(pat, projectGid)
Scheduler (Cloudflare Worker, cron-triggered)
    ↓ generateBlogPostFromBrief(taskName, notes)
MiniMax LLM (text generation, 1st pass)
    ↓ humanizeBody(body, siteName)
MiniMax LLM (Humanizer, 2nd pass, temp 0.5)
    ↓ getBestImage(imagePrompt)
Pexels API (featured image)
    ↓ INSERT INTO blog_posts
Cloudflare D1 (single source of truth)
    ↓ /api/blog?site=<slug>
Astro Sites (SSR fetch at build/runtime)
    ↓ markTaskComplete(pat, taskGid)
Asana (task marked complete)
```

## Required Services & Secrets

| Secret | What it is | How to get it |
|---|---|---|
| `MINIMAX_API_KEY` | MiniMax API bearer token | https://platform.minimaxi.com → API Keys |
| `ASANA_PAT` | Asana Personal Access Token | Asana → profile photo → Settings → Apps → Manage Developer Apps → "+ Create new token" (NOT "Create new app"). Token starts with `0/` or `1/` or `2/`, 30+ chars. Copy immediately — shown only once. |
| `ASANA_PROJECT_<SITE>` | Asana project GID (one per site) | Open the Asana project → URL: `app.asana.com/0/<projectGid>/...` — the numeric GID in the URL |
| `PEXELS_API_KEY` | Pexels API key (optional, for images) | https://www.pexels.com/api/ |
| `ADMIN_SECRET` | Shared secret for admin endpoints | Any random string you choose |

**Asana PAT gotcha (learned the hard way):** The "developer console" page has TWO sections: "Create new app" (OAuth, gives Client ID + Client Secret — NOT what you want) and "+ Create new token" (PAT, what you need). A Client Secret is NOT a PAT and will return 401 if used as a Bearer token.

## D1 Schema

```sql
CREATE TABLE blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  excerpt TEXT,
  tags TEXT DEFAULT '[]',
  featured_springs TEXT DEFAULT '[]',
  published_at DATETIME,
  author TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  image_url TEXT,
  site TEXT,              -- site slug, e.g. 'desertsoak' — NULL means invisible on regional sites
  asana_task_gid TEXT,    -- dedup key: if a published row has this GID, the task is skipped
  status TEXT DEFAULT 'published'  -- 'published' or 'system-failed'
);

CREATE TABLE system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Rows: 'last_cron_run' (ISO timestamp), 'cron_run_count' (integer as text)
```

## wrangler.toml

```toml
name = "your-api-worker"
main = "src/index.ts"
compatibility_date = "2026-03-26"

# Required secrets (set via `wrangler secret put <NAME>`):
# - MINIMAX_API_KEY      (MiniMax bearer token for LLM generation)
# - ASANA_PAT            (Asana Personal Access Token)
# - ASANA_PROJECT_<SITE> (one per site, e.g. ASANA_PROJECT_DESERTSOAK)
# - PEXELS_API_KEY       (optional, featured images)
# - ADMIN_SECRET         (protects admin endpoints)

[vars]
ENVIRONMENT = "production"

[[d1_databases]]
binding = "DB"
database_name = "your-db-name"
database_id = "your-d1-database-id"

[triggers]
# Mon + Thu at 06:00 UTC
crons = ["0 6 * * 1,4"]
```

## Component Code

### 1. Asana Client (`lib/asana.js`)

Minimal REST client. Two functions: list open tasks, mark task complete.

```js
const ASANA_API = 'https://app.asana.com/api/1.0';

function authHeaders(pat) {
  return {
    Authorization: `Bearer ${pat}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// List all incomplete tasks in a project, paginated.
// Returns [{ gid, name, notes, dueOn }].
export async function listOpenTasks(pat, projectGid) {
  if (!pat) throw new Error('ASANA_PAT not configured');
  if (!projectGid) return [];
  const tasks = [];
  let offset = undefined;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({
      limit: '100',
      opt_fields: 'name,notes,due_on,completed',
      opt_pretty: 'false',
    });
    if (offset) params.set('offset', offset);
    const res = await fetch(
      `${ASANA_API}/projects/${projectGid}/tasks?${params.toString()}`,
      { headers: authHeaders(pat) }
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Asana list tasks failed (${res.status}): ${txt}`);
    }
    const data = await res.json();
    for (const t of data.data || []) {
      if (!t.completed) {
        tasks.push({ gid: t.gid, name: t.name, notes: t.notes || '', dueOn: t.due_on || null });
      }
    }
    offset = data.next_page?.offset;
    if (!offset) break;
  }
  return tasks;
}

// Mark a task complete. Returns true on success, false on failure.
export async function markTaskComplete(pat, taskGid) {
  if (!pat || !taskGid) return false;
  const res = await fetch(`${ASANA_API}/tasks/${taskGid}`, {
    method: 'PUT',
    headers: authHeaders(pat),
    body: JSON.stringify({ data: { completed: true } }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`Asana markTaskComplete failed (${res.status}): ${txt}`);
    return false;
  }
  return true;
}
```

### 2. MiniMax Client (`lib/minimax.js`)

LLM client with two methods: `generateBlogPostFromBrief` (1st pass) and `humanizeBody` (2nd pass). Both use the same `chat()` method. Output format: `TITLE:...\nEXCERPT:...\nIMAGE_PROMPT:...\nBODY:\n<markdown>`.

```js
export function parseBlogOutput(raw) {
  let title = '', excerpt = '', imagePrompt = '', body = raw;
  const titleMatch = raw.match(/^TITLE:\s*(.+?)\s*$/m);
  if (titleMatch) title = titleMatch[1].trim();
  const excerptMatch = raw.match(/^EXCERPT:\s*(.+?)\s*$/m);
  if (excerptMatch) excerpt = excerptMatch[1].trim();
  const imageMatch = raw.match(/^IMAGE_PROMPT:\s*(.+?)\s*$/m);
  if (imageMatch) imagePrompt = imageMatch[1].trim();
  const bodyIdx = raw.indexOf('BODY:');
  if (bodyIdx >= 0) body = raw.substring(bodyIdx + 5).trim();
  body = body.replace(/^(TITLE:|EXCERPT:|IMAGE_PROMPT:|BODY:)\s*.*$/gm, '').trim();
  return { title, excerpt, imagePrompt, body };
}

export class MinimaxClient {
  constructor(apiKey) {
    this.apiKey = apiKey || '';
    this.baseUrl = 'https://api.minimax.io/v1/text/chatcompletion_v2';
    this.model = 'MiniMax-M2.7';  // adjust to current MiniMax model
  }

  async chat(messages, temperature = 0.7) {
    if (!this.apiKey) throw new Error('MINIMAX_API_KEY not configured');
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, temperature }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Minimax API error: ${response.status} - ${error}`);
    }
    const data = await response.json();
    if (data.base_resp && data.base_resp.status_code !== 0) {
      throw new Error(`Minimax API error: ${data.base_resp.status_code} - ${data.base_resp.status_msg}`);
    }
    if (data.choices && data.choices[0]) {
      let content = data.choices[0].message?.content || data.choices[0]?.text || '';
      return content;
    }
    return JSON.stringify(data);
  }

  // 1st pass: generate a full blog post from an Asana task's name + notes.
  async generateBlogPostFromBrief({ siteName, taskName, notes }) {
    const systemPrompt = `You are a writer for '${siteName}'. Write in a fact-driven, BLUF (Bottom Line Up Front) style. Lead with the key information. Support with narrative. Use accessible language. Be direct.

FORMATTING RULES:
1. NO bulleted or numbered lists. Use complete sentences and paragraphs.
2. NO H1 (#) tags. Use ## (H2) and ### (H3) for sections.
3. Length: 800-1500 words.
4. Avoid AI cliches: "In conclusion," "Nestled in the heart of," "Whether you're a seasoned pro or a first-timer."
5. NO thinking blocks. Start directly with TITLE:.`;

    const userPrompt = `Write a long-form article based on this content brief from an Asana task.

TOPIC: ${taskName}

CONTENT BRIEF (task notes — authoritative instructions for angle and coverage):
${notes && String(notes).trim() ? String(notes).trim() : '(No notes — cover the topic thoroughly with deep context, sensory detail, local history, practical logistics, and visitor guidance.)'}

OUTPUT FORMAT (start IMMEDIATELY with TITLE:):
TITLE: [SEO-optimized title]
EXCERPT: [2-sentence meta description]
IMAGE_PROMPT: [3-4 keywords for photo search]
BODY:
[BLUF intro, then ## and ### sections, each 250+ words. Flowing prose, no lists.]`;

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
  }

  // 2nd pass: strip AI-writing patterns from the body. Lower temperature.
  async humanizeBody(body, siteName) {
    if (!body || !body.trim()) return body;
    // Uses a Humanizer system prompt (see humanizerPrompt.js) that defines
    // 33 AI-writing patterns to remove. Key rules: no em dashes, no invented
    // facts, preserve all headings, output only the rewritten markdown body.
    const HUMANIZER_SYSTEM_PROMPT = `You are a writing editor that removes signs of AI-generated text. Output ONLY the humanized markdown body. Preserve all ## and ### headings. Never invent facts. No em dashes. No bulleted lists. Varied sentence length. Read naturally aloud.`;
    return this.chat([
      { role: 'system', content: HUMANIZER_SYSTEM_PROMPT },
      { role: 'user', content: `Humanize this blog post body for '${siteName}'. Return ONLY the markdown body.\n\nBODY:\n${body}` },
    ], 0.5);
  }
}
```

**Note:** The full Humanizer prompt (33 patterns, ~4000 words) is in `lib/humanizerPrompt.js`. It's adapted from [blader/humanizer](https://github.com/blader/humanizer) (MIT). For a production system, use the full prompt — the abbreviated version above is a placeholder.

### 3. Pexels Client (`lib/pexels.js`)

Optional. Fetches a featured image.

```js
export class PexelsClient {
  constructor(apiKey) {
    this.apiKey = apiKey || '';
    this.baseUrl = 'https://api.pexels.com/v1';
  }
  async getBestImage(query) {
    if (!this.apiKey) return null;
    const params = new URLSearchParams({ query, per_page: '5', orientation: 'landscape' });
    const res = await fetch(`${this.baseUrl}/search?${params}`, {
      headers: { Authorization: this.apiKey },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.photos?.length) return null;
    const best = data.photos[0];
    return {
      imageUrl: best.src.landscape,
      creditMarkdown: `*Photo by [${best.photographer}](${best.photographer_url}) via [Pexels](https://www.pexels.com)*`,
    };
  }
}
```

### 4. Scheduler (`src/scheduler.ts`)

The core orchestrator. Runs on cron, loops over sites, generates one post per site per run.

```ts
import { MinimaxClient, parseBlogOutput } from '../lib/minimax.js';
import { PexelsClient } from '../lib/pexels.js';
import { listOpenTasks, markTaskComplete } from '../lib/asana.js';

export interface Env {
  DB: D1Database;
  MINIMAX_API_KEY: string;
  PEXELS_API_KEY: string;
  ASANA_PAT?: string;
  // One per site:
  ASANA_PROJECT_SITE1?: string;
  ASANA_PROJECT_SITE2?: string;
  // ...add as many sites as you need
}

function slugify(s: string): string {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export async function handleScheduledEvent(event: any, env: Env, ctx: any) {
  // 1. Heartbeat (non-fatal if it fails)
  try {
    await env.DB.prepare(
      `INSERT INTO system_state (key, value, updated_at) VALUES ('last_cron_run', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(event.scheduledTime || new Date().toISOString()).run();
    await env.DB.prepare(
      `UPDATE system_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now') WHERE key = 'cron_run_count'`
    ).run();
  } catch (e: any) { console.warn(`Heartbeat failed: ${e.message}`); }

  // 2. Guard checks
  if (!env.MINIMAX_API_KEY) { console.error('❌ MINIMAX_API_KEY not set'); return; }
  if (!env.ASANA_PAT) { console.error('❌ ASANA_PAT not set'); return; }

  // 3. Site config — one entry per site/project
  const sites = [
    { site: 'site1', siteName: 'Site One', projectGid: env.ASANA_PROJECT_SITE1 },
    { site: 'site2', siteName: 'Site Two', projectGid: env.ASANA_PROJECT_SITE2 },
  ];

  const minimax = new MinimaxClient(env.MINIMAX_API_KEY);

  for (const siteCfg of sites) {
    if (!siteCfg.projectGid) { console.log(`⏭️ No GID for ${siteCfg.site}`); continue; }

    // 4. Fetch open Asana tasks
    let tasks: any[] = [];
    try {
      tasks = await listOpenTasks(env.ASANA_PAT, siteCfg.projectGid);
    } catch (e: any) {
      console.error(`❌ Asana fetch failed for ${siteCfg.site}: ${e.message}`);
      continue;
    }
    if (tasks.length === 0) { console.log(`✅ No tasks for ${siteCfg.site}`); continue; }

    // 5. Dedup: skip tasks already published (by asana_task_gid)
    let target: any = null;
    for (const t of tasks) {
      const done = await env.DB.prepare('SELECT id FROM blog_posts WHERE asana_task_gid = ? AND status = ?')
        .bind(t.gid, 'published').first();
      if (!done) { target = t; break; }
    }
    if (!target) { console.log(`✅ All tasks for ${siteCfg.site} already published`); continue; }

    console.log(`📝 [${siteCfg.site}] Generating: ${target.name}`);

    try {
      // 6. Generate (1st pass)
      const rawOutput = await minimax.generateBlogPostFromBrief({
        siteName: siteCfg.siteName, taskName: target.name, notes: target.notes,
      });
      const parsed = parseBlogOutput(rawOutput);
      const postTitle = parsed.title || target.name;
      let slug = slugify(postTitle) || slugify(target.name) || target.gid;
      // Slug uniqueness
      const existing = await env.DB.prepare('SELECT id FROM blog_posts WHERE slug = ?').bind(slug).first();
      if (existing) slug = `${slug}-${String(target.gid).slice(-6)}`;

      // 7. Humanize (2nd pass, non-fatal)
      let postBody = parsed.body;
      try {
        const humanized = await minimax.humanizeBody(parsed.body, siteCfg.siteName);
        if (humanized?.trim()) postBody = humanized;
      } catch (e: any) { console.warn(`⚠️ Humanize failed: ${e.message}`); }

      // 8. Featured image (optional, non-fatal)
      let imageUrl: string | null = null;
      let imageCredit = '';
      try {
        if (env.PEXELS_API_KEY) {
          const pexels = new PexelsClient(env.PEXELS_API_KEY);
          const img = await pexels.getBestImage(parsed.imagePrompt || target.name);
          if (img) { imageUrl = img.imageUrl; imageCredit = `\n\n${img.creditMarkdown}`; }
        }
      } catch (e: any) { console.error(`⚠️ Image failed: ${e.message}`); }

      const finalBody = imageUrl ? `![${target.name}](${imageUrl})${imageCredit}\n\n${postBody}` : postBody;

      // 9. Save to D1
      await env.DB.prepare(`
        INSERT INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author, image_url, site, asana_task_gid, status)
        VALUES (?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, ?)
      `).bind(postTitle, slug, finalBody, parsed.excerpt || '', new Date().toISOString(),
              siteCfg.siteName, imageUrl, siteCfg.site, target.gid, 'published').run();

      console.log(`💾 [${siteCfg.site}] Saved: ${slug}`);

      // 10. Mark Asana task complete
      const completed = await markTaskComplete(env.ASANA_PAT, target.gid);
      if (completed) console.log(`✅ [${siteCfg.site}] Marked complete: ${target.gid}`);
      else console.warn(`⚠️ Saved but failed to mark ${target.gid} complete`);
    } catch (error: any) {
      // Record failure row (NOT marked complete → retries next run)
      const errMsg = `${error?.name || 'Error'}: ${error?.message || String(error)}`;
      console.error(`❌ [${siteCfg.site}] Failed for ${target.gid}: ${errMsg}`);
      try {
        await env.DB.prepare('DELETE FROM blog_posts WHERE asana_task_gid = ? AND status = ?')
          .bind(target.gid, 'system-failed').run();
        await env.DB.prepare(
          `INSERT INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author, image_url, site, asana_task_gid, status)
           VALUES (?, ?, ?, ?, '[]', '[]', ?, 'system-failed', NULL, ?, ?, 'system-failed')`
        ).bind(target.name, `asana-failed-${target.gid}`, `ERROR: ${errMsg}`, '',
                new Date().toISOString(), siteCfg.site, target.gid).run();
      } catch (dbErr: any) { console.error(`❌ DB fail: ${dbErr.message}`); }
    }
  }
  console.log('🗓️ Scheduler run complete.');
}
```

### 5. Worker Entry (`src/index.ts`)

Wires the scheduled event + Hono app.

```ts
import { createApp } from './routes';
import { handleScheduledEvent } from './scheduler';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: any, ctx: any) {
    await handleScheduledEvent(event, env, ctx);
  }
};
```

### 6. Admin Endpoints (`src/routes.ts`)

Three admin endpoints (all protected by `ADMIN_SECRET` header):

```ts
import { Hono } from 'hono';
import { handleScheduledEvent } from './scheduler';
import { listOpenTasks } from '../lib/asana.js';

const checkAdmin = (c: any) => {
  const secret = (c.env as any).ADMIN_SECRET;
  if (secret && c.req.header('ADMIN_SECRET') !== secret) return false;
  return true;
};

// GET /api/admin/asana-check — test Asana connectivity per project
app.get('/api/admin/asana-check', async (c) => {
  if (!checkAdmin(c)) return c.text('Unauthorized', 401);
  const env = c.env as any;
  const pat = env.ASANA_PAT;
  if (!pat) return c.json({ ok: false, error: 'ASANA_PAT not set' }, 400);
  const projects = [
    { site: 'site1', gid: env.ASANA_PROJECT_SITE1 },
    { site: 'site2', gid: env.ASANA_PROJECT_SITE2 },
  ];
  const results = [];
  for (const p of projects) {
    if (!p.gid) { results.push({ site: p.site, configured: false, error: 'No GID' }); continue; }
    try {
      const tasks = await listOpenTasks(pat, p.gid);
      results.push({ site: p.site, configured: true, taskCount: tasks.length,
        sampleTasks: tasks.slice(0, 3).map((t: any) => ({ gid: t.gid, name: t.name })) });
    } catch (e: any) {
      results.push({ site: p.site, configured: true, error: e.message });
    }
  }
  return c.json({ ok: true, patSet: true, results });
});

// POST /api/admin/trigger-scheduler — run the full auto-poster on demand
// CRITICAL: await the full run. Do NOT use waitUntil — Cloudflare cancels it
// after the response is sent, killing mid-generation LLM calls.
app.post('/api/admin/trigger-scheduler', async (c) => {
  if (!checkAdmin(c)) return c.text('Unauthorized', 401);
  const env = c.env as any;
  await handleScheduledEvent({ scheduledTime: new Date().toISOString() }, env, c.executionCtx);
  const recent = await env.DB.prepare(
    `SELECT id, title, slug, site, status, asana_task_gid FROM blog_posts ORDER BY id DESC LIMIT 12`
  ).all();
  return c.json({ ok: true, triggered: true, done: true, recentPosts: recent.results });
});

// Blog API — sites fetch posts from here
app.get('/api/blog', async (c) => {
  const site = c.req.query('site');
  let query = 'SELECT * FROM blog_posts WHERE status = ?';
  const params: any[] = ['published'];
  if (site) { query += ' AND site = ?'; params.push(site); }
  query += ' ORDER BY published_at DESC LIMIT ?';
  params.push(20);
  const results = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ data: results.results });
});
```

## Step-by-Step Setup

1. **Create D1 database + tables:**
   ```bash
   npx wrangler d1 create your-db-name
   # Put the database_id in wrangler.toml
   npx wrangler d1 execute your-db-name --remote --file=schema.sql
   ```

2. **Create Asana projects** — one per site. Note the numeric GID from each project's URL.

3. **Create Asana PAT** — Asana → Settings → Apps → Manage Developer Apps → "+ Create new token". Copy the full token (starts with `0/`, `1/`, or `2/`).

4. **Set secrets on the Worker:**
   ```bash
   printf 'your-minimax-key' | npx wrangler secret put MINIMAX_API_KEY
   printf 'your-asana-pat'   | npx wrangler secret put ASANA_PAT
   printf 'site1-gid'        | npx wrangler secret put ASANA_PROJECT_SITE1
   printf 'site2-gid'        | npx wrangler secret put ASANA_PROJECT_SITE2
   printf 'your-admin-secret' | npx wrangler secret put ADMIN_SECRET
   printf 'your-pexels-key'  | npx wrangler secret put PEXELS_API_KEY  # optional
   ```
   Use `printf` (not `echo`) to avoid trailing newline issues.

5. **Deploy:**
   ```bash
   npx wrangler deploy
   ```

6. **Verify Asana connectivity:**
   ```bash
   curl -s -H "ADMIN_SECRET: your-admin-secret" \
     https://your-worker.workers.dev/api/admin/asana-check | jq
   ```
   Each project should show `taskCount > 0`.

7. **Trigger first run:**
   ```bash
   curl -s -X POST -H "ADMIN_SECRET: your-admin-secret" \
     https://your-worker.workers.dev/api/admin/trigger-scheduler | jq
   ```
   This takes 3-5 minutes (4 sites × 2 LLM calls each). The response includes the 12 most recent D1 rows.

8. **Verify posts are served:**
   ```bash
   curl -s "https://your-worker.workers.dev/api/blog?site=site1&limit=5" | jq
   ```

## Gotchas Learned

1. **`printf` not `echo`** — `echo` adds a trailing newline to the secret value, which causes auth failures. Always use `printf 'value' | wrangler secret put NAME`.

2. **Secret propagation delay** — after `wrangler secret put`, the new value takes 30-60 seconds to reach the Worker. If you test immediately, you'll see the old value.

3. **`waitUntil` cancels long runs** — if you use `c.executionCtx.waitUntil()` for the scheduler and return the response early, Cloudflare cancels the background task after ~30s. LLM calls take 30-60s each. Solution: `await` the full run directly in the request handler. The HTTP request stays open until done (Cloudflare allows long-running fetch requests while I/O is pending).

4. **`site` must be set** — if the D1 INSERT doesn't include `site`, the post is invisible on regional sites (they filter `WHERE site = ?`). Always set it.

5. **Asana PAT vs Client Secret** — the developer console has "Create new app" (OAuth, gives Client ID + Client Secret) and "+ Create new token" (PAT). A Client Secret is NOT a PAT and returns 401 as a Bearer token.

6. **Dedup by `asana_task_gid`** — the scheduler checks if a published row already exists for the task GID before generating. This prevents duplicates if a task wasn't marked complete. Failed runs write a `system-failed` row (not `published`) so the task retries next cron.

7. **Humanizer is non-fatal** — if the 2nd-pass LLM call fails, the scheduler uses the raw 1st-pass body. Don't let a humanizer failure block the post.

8. **Pexels is non-fatal** — if the image fetch fails, the post is saved without a featured image.

9. **MiniMax error 1004 "login fail"** — this can mean the key is invalid OR the account is out of funds. Check both.
