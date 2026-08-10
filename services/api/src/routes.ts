import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { graphqlServer } from '@hono/graphql-server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema';
import { fieldResolvers, createRootResolver, type Bindings } from './resolvers';
import BlogQueue from '../../data/blog-content-queue.json';
import { MinimaxClient, parseBlogOutput, markdownToTipTap } from '../lib/minimax.js';
import { PexelsClient } from '../lib/pexels.js';
import { listOpenTasks } from '../lib/asana.js';
import { handleScheduledEvent } from './scheduler';

const schema = makeExecutableSchema({ typeDefs, resolvers: fieldResolvers });

// In-memory rate limiting for chat (20 req/hour per IP)
const chatRateLimits = new Map<string, { count: number; windowStart: number }>();

export const createApp = () => {
  const app = new Hono<{ Bindings: Bindings }>();

  // CORS middleware - allow all site domains
  app.use(
    '*',
    cors({
      origin: [
        'https://soaktherockies.com',
        'https://www.soaktherockies.com',
        'https://soakcolorado.com',
        'https://www.soakcolorado.com',
        'https://washingtonhotsprings.com',
        'https://www.washingtonhotsprings.com',
        'https://desertsoak.com',
        'https://www.desertsoak.com',
        'https://shastahotsprings.com',
        'https://www.shastahotsprings.com',
        'https://alaskahotsprings.com',
        'https://www.alaskahotsprings.com',
        'https://soaktrail.com',
        'https://www.soaktrail.com',
        'https://shop.soaktrail.com',
        'http://localhost:4321',
      ],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      credentials: true,
    })
  );

  // REST API endpoints (preferred over GraphQL)
  app.get('/api/springs', async (c) => {
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');
    const state = c.req.query('state');
    const accessType = c.req.query('access_type');
    const site = c.req.query('site');

    let sql = 'SELECT * FROM springs';
    const params: any[] = [];
    const conditions: string[] = [];

    if (state) {
      conditions.push('state = ?');
      params.push(state);
    }

    if (accessType) {
      conditions.push('access_type = ?');
      params.push(accessType);
    }

    if (site) {
      conditions.push('site = ?');
      params.push(site);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ data: results.results, error: false });
  });

  // Build-time export: returns all springs for a site (no pagination)
  app.get('/api/springs/export/:site', async (c) => {
    const site = c.req.param('site');
    const results = await c.env.DB.prepare('SELECT * FROM springs WHERE site = ?').bind(site).all();

    // Parse JSON fields for each spring
    const springs = (results.results || []).map((s: any) => {
      const parsed = { ...s };
      // Parse JSON blob fields
      for (const field of ['chemistry', 'chemistry_details', 'usgs_json', 'osm_json']) {
        if (parsed[field] && typeof parsed[field] === 'string') {
          try { parsed[field] = JSON.parse(parsed[field]); } catch {}
        }
      }
      return parsed;
    });

    return c.json({ data: springs, error: false, count: springs.length });
  });

  app.get('/api/springs/:slug', async (c) => {
    const slug = c.req.param('slug');
    const result = await c.env.DB.prepare('SELECT * FROM springs WHERE slug = ?').bind(slug).first();

    if (result) {
      const parsed = { ...result };
      for (const field of ['chemistry', 'chemistry_details', 'usgs_json', 'osm_json']) {
        if (parsed[field] && typeof parsed[field] === 'string') {
          try { parsed[field] = JSON.parse(parsed[field]); } catch {}
        }
      }
      return c.json({ data: parsed, error: false });
    }

    return c.json({ data: null, error: true });
  });

  // Mineral metadata for the Soaktrail minerals hub. field maps to the key
  // inside each spring's chemistry_details JSON blob.
  const MINERALS = [
    { key: 'ph', name: 'pH', field: 'ph', unit: 'pH', rankLabel: 'Highest pH (most alkaline)', group: 'property' },
    { key: 'tds', name: 'Total Dissolved Solids', field: 'tds_mgL', unit: 'mg/L', rankLabel: 'Most mineral-rich (by TDS)', group: 'property' },
    { key: 'calcium', name: 'Calcium', field: 'calcium_mg_l', unit: 'mg/L', rankLabel: 'Most calcium', group: 'mineral' },
    { key: 'magnesium', name: 'Magnesium', field: 'magnesium_mg_l', unit: 'mg/L', rankLabel: 'Most magnesium', group: 'mineral' },
    { key: 'sodium', name: 'Sodium', field: 'sodium_mg_l', unit: 'mg/L', rankLabel: 'Most sodium', group: 'mineral' },
    { key: 'sulfate', name: 'Sulfate', field: 'sulfate_mg_l', unit: 'mg/L', rankLabel: 'Most sulfate', group: 'mineral' },
    { key: 'chloride', name: 'Chloride', field: 'chloride_mg_l', unit: 'mg/L', rankLabel: 'Most chloride', group: 'mineral' },
    { key: 'iron', name: 'Iron', field: 'iron_mg_l', unit: 'mg/L', rankLabel: 'Most iron', group: 'mineral' },
  ];
  const MINERAL_BY_KEY = Object.fromEntries(MINERALS.map((m) => [m.key, m]));

  app.get('/api/minerals', (c) => c.json({ data: MINERALS, error: false }));

  // Springs ranked by a mineral's concentration (descending). Reads
  // chemistry_details JSON per spring, filters to those with a value, sorts.
  app.get('/api/minerals/:mineral/springs', async (c) => {
    const mineralKey = c.req.param('mineral');
    const m = MINERAL_BY_KEY[mineralKey];
    if (!m) return c.json({ data: null, error: true, message: 'Unknown mineral' }, 404);
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

    const rows = await c.env.DB
      .prepare('SELECT slug, name, state, temperature_f, access_type, development, chemistry_details, chemistry_source, chemistry_sampled_on FROM springs')
      .all();

    const all = (rows.results || [])
      .map((s: any) => {
        let cd = s.chemistry_details;
        if (typeof cd === 'string') { try { cd = JSON.parse(cd); } catch { cd = {}; } }
        const raw = cd?.[m.field];
        if (raw == null || raw === '') return null;
        const value = parseFloat(raw);
        if (isNaN(value)) return null;
        return {
          slug: s.slug,
          name: s.name,
          state: s.state,
          temperature_f: s.temperature_f,
          access_type: s.access_type,
          development: s.development,
          value,
          unit: m.unit,
          chemistry_source: s.chemistry_source,
          chemistry_sampled_on: s.chemistry_sampled_on,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.value - a.value);

    // count = true total with verified data; springs = top-N slice.
    return c.json({ data: { mineral: m, count: all.length, springs: all.slice(0, limit) }, error: false });
  });

  app.get('/api/blog', async (c) => {
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');
    const site = c.req.query('site');
    // Only expose published posts (excludes 'system-failed'). Optional site filter
    // partitions the shared table across desertsoak / soakcolorado / soaktherockies.
    let sql = 'SELECT * FROM blog_posts WHERE status = ?';
    const params: any[] = ['published'];
    if (site) {
      sql += ' AND site = ?';
      params.push(site);
    }
    sql += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const results = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ data: results.results, error: false });
  });

  app.get('/api/blog/:slug', async (c) => {
    const slug = c.req.param('slug');
    const site = c.req.query('site');
    let sql = 'SELECT * FROM blog_posts WHERE slug = ? AND status = ?';
    const params: any[] = [slug, 'published'];
    if (site) {
      sql += ' AND site = ?';
      params.push(site);
    }
    const result = await c.env.DB.prepare(sql).bind(...params).first();
    return c.json({ data: result, error: !result });
  });

  // Admin auth check
  const checkAdmin = (c: any) => {
    const secret = (c.env as any).ADMIN_SECRET;
    if (secret && c.req.header('ADMIN_SECRET') !== secret) {
      return false;
    }
    return true; // if no secret configured, assume Cloudflare Access handles auth
  };

  app.delete('/api/admin/blog/:slug', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);
    const slug = c.req.param('slug');
    await c.env.DB.prepare('DELETE FROM blog_posts WHERE slug = ?').bind(slug).run();
    return c.json({ success: true, deleted: slug });
  });

  app.get('/api/admin/blog-queue-status', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);
    
    const existingSlugsReq = await c.env.DB.prepare('SELECT slug, author FROM blog_posts').all();
    const allRows = existingSlugsReq.results as any[];
    const existingSlugsSet = new Set(allRows.map((r) => r.slug));
    const failedCount = allRows.filter((r) => r.author === 'system-failed').length;

    const totalTopics = BlogQueue.topics.length;
    const generatedCount = allRows.filter((r) => r.author !== 'system-failed').length;
    const missingSlugs = BlogQueue.topics.filter((t: any) => !existingSlugsSet.has(t.slug)).map((t: any) => t.slug);
    
    const lastPublishedReq = await c.env.DB.prepare(
      "SELECT published_at FROM blog_posts WHERE author != 'system-failed' ORDER BY published_at DESC LIMIT 1"
    ).first();
    
    // Cron heartbeat — when did the scheduled handler last fire?
    let lastCronRun = null;
    let cronRunsTotal = 0;
    try {
      const cronRow = await c.env.DB.prepare(
        "SELECT value, updated_at FROM system_state WHERE key = 'last_cron_run'"
      ).first();
      if (cronRow) {
        lastCronRun = (cronRow as any).updated_at;
        const countRow = await c.env.DB.prepare(
          "SELECT value FROM system_state WHERE key = 'cron_run_count'"
        ).first();
        cronRunsTotal = countRow ? parseInt((countRow as any).value) : 0;
      }
    } catch (_) { /* system_state table may not exist yet */ }
    
    return c.json({
      total_topics: totalTopics,
      generated_count: generatedCount,
      failed_count: failedCount,
      missing_count: missingSlugs.length,
      missing_slugs: missingSlugs,
      next_up: missingSlugs.length > 0 ? missingSlugs[0] : null,
      last_published_at_raw: lastPublishedReq ? lastPublishedReq.published_at : null,
      last_cron_run: lastCronRun,
      cron_runs_total: cronRunsTotal,
    });
  });

  // Diagnostic: test Asana connectivity for all 4 configured projects.
  // Reports per-project: whether the GID is set, the open-task count, a few
  // sample task names, or the error (auth/404/etc.) if the fetch failed.
  app.get('/api/admin/asana-check', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);
    const env = c.env as any;
    const pat = env.ASANA_PAT;
    if (!pat) return c.json({ ok: false, error: 'ASANA_PAT not set' }, 400);

    const projects = [
      { site: 'desertsoak', name: 'Desert Soak', gid: env.ASANA_PROJECT_DESERTSOAK },
      { site: 'soakcolorado', name: 'Soak Colorado', gid: env.ASANA_PROJECT_SOAKCOLORADO },
      { site: 'soaktherockies', name: 'Soak the Rockies', gid: env.ASANA_PROJECT_SOAKTHEROCKIES },
      { site: 'alaskahotsprings', name: 'Alaska Hot Springs', gid: env.ASANA_PROJECT_ALASKAHOTSPRINGS },
    ];

    const results = [];
    for (const p of projects) {
      if (!p.gid) {
        results.push({ site: p.site, configured: false, taskCount: 0, error: 'No project GID set' });
        continue;
      }
      try {
        const tasks = await listOpenTasks(pat, p.gid);
        results.push({
          site: p.site,
          configured: true,
          projectGid: p.gid,
          taskCount: tasks.length,
          sampleTasks: tasks.slice(0, 3).map((t: any) => ({ gid: t.gid, name: t.name })),
        });
      } catch (e: any) {
        results.push({ site: p.site, configured: true, projectGid: p.gid, taskCount: 0, error: e.message });
      }
    }
    return c.json({ ok: true, patSet: true, results });
  });

  // Manual trigger: run the Asana-driven scheduler on demand using the live
  // secrets already on the Worker, so the full flow (Asana -> MiniMax -> D1)
  // can be verified without waiting for the cron. The run is registered with
  // waitUntil so it completes even if this response returns first; we wait up
  // to 25s inline for a quick result, then return the most recent D1 rows.
  app.post('/api/admin/trigger-scheduler', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);
    const env = c.env as any;
    const runPromise = handleScheduledEvent(
      { scheduledTime: new Date().toISOString() },
      env,
      c.executionCtx
    );
    c.executionCtx.waitUntil(runPromise);
    let done = false;
    await Promise.race([
      runPromise.then(() => { done = true; }).catch(() => { done = true; }),
      new Promise((r) => setTimeout(r, 25000)),
    ]);
    const recent = await env.DB.prepare(
      `SELECT id, title, slug, site, status, asana_task_gid, published_at
       FROM blog_posts ORDER BY id DESC LIMIT 12`
    ).all();
    return c.json({ ok: true, triggered: true, done, recentPosts: recent.results });
  });

  // Reset all system-failed posts so they retry on next cron run
  app.post('/api/admin/reset-failed', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);
    const result = await c.env.DB.prepare(
      "DELETE FROM blog_posts WHERE author = 'system-failed'"
    ).run();
    return c.json({ success: true, deleted_count: (result as any).changes || 0 });
  });

  // Wipe all blog_posts to start fresh (useful after queue overhaul)
  app.post('/api/admin/reset-all', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);
    const result = await c.env.DB.prepare('DELETE FROM blog_posts').run();
    return c.json({ success: true, deleted_count: (result as any).changes || 0 });
  });

  app.post('/api/admin/generate-blog', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);
    
    const env = c.env as any;
    if (!env.MINIMAX_API_KEY) {
      return c.json({ error: 'MINIMAX_API_KEY is not defined in environment.' }, 500);
    }
    
    const minimax = new MinimaxClient(env.MINIMAX_API_KEY as string);
    
    let targetTopic = null;
    for (const topic of BlogQueue.topics) {
      const existingReq = await c.env.DB.prepare('SELECT id FROM blog_posts WHERE slug = ?').bind(topic.slug).first();
      if (!existingReq) {
        targetTopic = topic;
        break;
      }
    }

    if (!targetTopic) {
      return c.json({ success: true, message: 'No new topics left in the queue.' });
    }

    try {
      const rawOutput = await minimax.generateBlogPost(targetTopic, BlogQueue.settings);
      const parsed = parseBlogOutput(rawOutput);
      const postTitle = (targetTopic as any).title;
      const postExcerpt = parsed.excerpt || (targetTopic as any).excerpt;
      const postBody = parsed.body;

      const tags = JSON.stringify((targetTopic as any).tags);
      const featuredSprings = JSON.stringify((targetTopic as any).featured_springs);
      const author = BlogQueue.settings.author || 'Soak the Rockies Team';
      const publishedAt = new Date().toISOString();

      // Fetch featured image from Pexels (or Workers AI fallback)
      let imageUrl: string | null = null;
      let imageCredit = '';
      const imageQuery = parsed.imagePrompt || (targetTopic as any).keyword || (targetTopic as any).title;
      try {
        if (env.PEXELS_API_KEY) {
          const pexels = new PexelsClient(env.PEXELS_API_KEY);
          const img = await pexels.getBestImage(imageQuery);
          if (img) {
            imageUrl = img.imageUrl;
            imageCredit = `\n\n${img.creditMarkdown}`;
          }
        }
        if (!imageUrl && env.AI) {
          const aiResp = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
            prompt: imageQuery,
          });
          if (aiResp && aiResp.image) {
            console.log('Workers AI image generated but no R2 bucket configured — skipping');
          }
        }
      } catch (imgErr: any) {
        console.error(`Image fetch failed: ${imgErr.message}`);
      }

      const finalBody = imageUrl
        ? `![${imageQuery}](${imageUrl})${imageCredit}\n\n${postBody}`
        : postBody;

      await c.env.DB.prepare(`
        INSERT INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        postTitle,
        (targetTopic as any).slug,
        finalBody,
        postExcerpt,
        tags,
        featuredSprings,
        publishedAt,
        author,
        imageUrl
      ).run();

      // Also publish to WollyCMS so the Astro frontend can display the post
      const wollyApiKey = env.WOLLY_CMS_API_KEY;
      const wollyService = env.WOLLYCMS;
      if (wollyApiKey) {
        const WOLLY_API_URL = 'https://wollycms.buzzuw2.workers.dev/api';
        const wollyFetch = wollyService ? (url: string, init?: RequestInit) => wollyService.fetch(url, init) : fetch;
        const listRes = await wollyFetch(`${WOLLY_API_URL}/content/pages?type=blog&limit=100`, {
          headers: { Authorization: `Bearer ${wollyApiKey}` },
        });
        const listData: any = await listRes.json();
        const existing = listData?.data?.find((p: any) => p.slug === (targetTopic as any).slug);
        const method = existing ? 'PUT' : 'POST';
        const url = existing
          ? `${WOLLY_API_URL}/admin/pages/${existing.id}`
          : `${WOLLY_API_URL}/admin/pages`;

        const wollyPayload = {
          title: postTitle,
          slug: (targetTopic as any).slug,
          typeId: 2,
          type: 'blog',
          status: 'published',
          published_at: publishedAt,
          fields: {
            excerpt: postExcerpt,
            body: finalBody,
            featured_image: imageUrl || '',
            site: 'soaktherockies',
          },
        };

        const wollyRes = await wollyFetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${wollyApiKey}`,
          },
          body: JSON.stringify(wollyPayload),
        });

        if (!wollyRes.ok) {
          const err = await wollyRes.text();
          console.error(`WollyCMS publish failed for ${(targetTopic as any).slug}: ${err}`);
        }
      }

      return c.json({ success: true, message: `Successfully generated and published: ${postTitle}`, slug: (targetTopic as any).slug });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

  // Patch the site field on an existing WollyCMS post without needing D1 data
  app.post('/api/admin/patch-wolly-site', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);

    const { slug } = await c.req.json();
    if (!slug) return c.json({ error: 'Missing slug' }, 400);

    const wollyApiKey = (c.env as any).WOLLY_CMS_API_KEY;
    if (!wollyApiKey) return c.json({ error: 'WOLLY_CMS_API_KEY not set' }, 500);

    const WOLLY_API_URL = 'https://wollycms.buzzuw2.workers.dev/api';
    const wollyService = (c.env as any).WOLLYCMS;
    const wollyFetch = wollyService ? (url: string, init?: RequestInit) => wollyService.fetch(url, init) : fetch;

    const listRes = await wollyFetch(`${WOLLY_API_URL}/content/pages?type=blog&limit=100`, {
      headers: { Authorization: `Bearer ${wollyApiKey}` },
    });
    const listData: any = await listRes.json();
    const existing = listData?.data?.find((p: any) => p.slug === slug);
    if (!existing) return c.json({ error: `No WollyCMS page found for slug: ${slug}` }, 404);

    const payload = {
      title: existing.title,
      slug,
      typeId: existing.typeId || 2,
      type: 'blog',
      status: 'published',
      published_at: existing.published_at || new Date().toISOString(),
      fields: {
        ...(existing.fields || {}),
        site: 'soaktherockies',
      },
    };

    const res = await wollyFetch(`${WOLLY_API_URL}/admin/pages/${existing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wollyApiKey}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return c.json({ error: `WollyCMS PUT failed: ${err}` }, 500);
    }

    return c.json({ success: true, slug, id: existing.id });
  });

  app.post('/api/admin/republish-to-wolly', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);

    const { slug } = await c.req.json();
    if (!slug) return c.json({ error: 'Missing slug' }, 400);

    const post = await c.env.DB.prepare('SELECT * FROM blog_posts WHERE slug = ?').bind(slug).first();
    if (!post) return c.json({ error: `No D1 post found for slug: ${slug}` }, 404);

    const wollyApiKey = (c.env as any).WOLLY_CMS_API_KEY;
    if (!wollyApiKey) return c.json({ error: 'WOLLY_CMS_API_KEY not set' }, 500);

    const WOLLY_API_URL = 'https://wollycms.buzzuw2.workers.dev/api';
    const wollyService = (c.env as any).WOLLYCMS;
    const wollyFetch = wollyService ? (url: string, init?: RequestInit) => wollyService.fetch(url, init) : fetch;

    const listRes = await wollyFetch(`${WOLLY_API_URL}/content/pages?type=blog&limit=100`, {
      headers: { Authorization: `Bearer ${wollyApiKey}` },
    });
    const listData: any = await listRes.json();
    const existing = listData?.data?.find((p: any) => p.slug === slug);
    const method = existing ? 'PUT' : 'POST';
    const url = existing ? `${WOLLY_API_URL}/admin/pages/${existing.id}` : `${WOLLY_API_URL}/admin/pages`;

    const payload = {
      title: (post as any).title,
      slug,
      typeId: 2,
      type: 'blog',
      status: 'published',
      published_at: (post as any).published_at,
      fields: {
        excerpt: (post as any).excerpt,
        body: (post as any).body,
        site: 'soaktherockies',
      },
    };

    const res = await wollyFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wollyApiKey}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return c.json({ error: `WollyCMS ${method} failed: ${err}` }, 500);
    }

    return c.json({ success: true, slug, method });
  });

  // Chat endpoint — AI Trip Assistant
  app.post('/api/chat', async (c) => {
    // In-memory rate limiting (20 req/hour per IP)
    const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    const limit = chatRateLimits.get(ip);

    if (limit) {
      if (now - limit.windowStart > oneHourMs) {
        chatRateLimits.set(ip, { count: 1, windowStart: now });
      } else if (limit.count >= 20) {
        return c.json({ reply: "Too many questions — come back in an hour.", sources: [] }, 429);
      } else {
        limit.count++;
      }
    } else {
      chatRateLimits.set(ip, { count: 1, windowStart: now });
    }

    const body = await c.req.json();
    const { messages = [], context = {} } = body;
    const { siteUrl = '', siteName = 'Soaktrail', region = '', currentSpringSlug } = context;

    // Fetch springs data (cached 1hr via Cloudflare Cache API)
    let springsSummary = '';
    let springsData: any[] = [];
    try {
      if (siteUrl) {
        const cacheKey = new Request(`${siteUrl}/springs.json`);
        const cache = caches.default;
        let cached = await cache.match(cacheKey);
        let springs: any;
        if (cached) {
          springs = await cached.json();
        } else {
          const res = await fetch(`${siteUrl}/springs.json`);
          springs = await res.json();
          await cache.put(cacheKey, new Response(JSON.stringify(springs), {
            headers: { 'Cache-Control': 'public, max-age=3600' }
          }));
        }
        springsData = Array.isArray(springs) ? springs : (springs.data || []);

        springsSummary = springsData.map((s: any) => {
          const parts = [s.name, `/springs/${s.slug}`];
          if (s.temp_f || s.temperature_f) parts.push(`${s.temp_f || s.temperature_f}F`);
          if (s.fee !== undefined && s.fee !== null) parts.push(s.fee === 0 ? 'Free' : `$${s.fee}`);
          if (s.access_type) parts.push(s.access_type);
          if (s.development) parts.push(s.development);
          if (s.lat && s.lng) parts.push(`${s.lat},${s.lng}`);
          return parts.join(' | ');
        }).join('\n');
      }
    } catch (e) {
      console.error('Failed to fetch springs data:', e);
    }

    const today = new Date().toISOString().split('T')[0];

    let currentSpringContext = '';
    if (currentSpringSlug && springsData.length > 0) {
      const spring = springsData.find((s: any) => s.slug === currentSpringSlug);
      if (spring) {
        currentSpringContext = `\nThe user is currently viewing: ${spring.name}. Details: ${JSON.stringify({ temp_f: spring.temp_f, fee: spring.fee, access_type: spring.access_type, development: spring.development, description: spring.description })}`;
      }
    }

    const systemPrompt = `You are a hot springs trip planner for ${siteName}, covering ${region}.

Available springs (recommend only from this list):
${springsSummary}

When helping plan trips:
- Structure multi-day itineraries as "Day 1:", "Day 2:", etc.
- Link each spring as ${siteUrl}/springs/{slug}
- Include campground search links: https://www.recreation.gov/search?latitude={lat}&longitude={lng}&radius=20&inventory_type=camping
- Recommend gear from https://shop.soaktrail.com
- Note access conditions, fees, and seasonal considerations
- Ask about trip duration, vehicle type, and preferences if not stated
- Keep responses concise and scannable using markdown

If asked about unrelated topics, politely redirect to hot springs and trip planning.

Current date: ${today}${currentSpringContext}`;

    const modelMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    try {
      const aiResponse = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: modelMessages,
      });

      const replyText = typeof aiResponse === 'string' ? aiResponse : (aiResponse as any).response;

      // Extract mentioned springs as sources
      const slugPattern = /\/springs\/([a-z0-9-]+)/gi;
      const matches = [...replyText.matchAll(slugPattern)];
      const mentionedSlugs = [...new Set(matches.map(m => m[1]))];
      const sources = mentionedSlugs
        .map(slug => {
          const spring = springsData.find((s: any) => s.slug === slug);
          return spring ? { name: spring.name, slug: spring.slug, type: 'spring' } : null;
        })
        .filter(Boolean);

      return c.json({ reply: replyText, sources });

    } catch (error: any) {
      console.error('AI Error:', error);
      return c.json({ reply: "I'm having trouble connecting right now. Please try again in a moment.", sources: [] }, 500);
    }
  });

  // Create or update a blog post (admin endpoint)
  app.post('/api/blog', async (c) => {
    if (!checkAdmin(c)) return c.text('Unauthorized', 401);
    
    const body = await c.req.json();
    const { title, slug, content, excerpt, tags, featured_springs, author, published_at } = body;

    if (!title || !slug || !content) {
      return c.json({ error: 'Missing required fields: title, slug, content' }, 400);
    }

    const tagsJson = JSON.stringify(tags || []);
    const featuredJson = JSON.stringify(featured_springs || []);
    const publishedAt = published_at || new Date().toISOString();
    const authorName = author || 'Soak the Rockies Team';

    // Check if exists
    const existing = await c.env.DB.prepare('SELECT id FROM blog_posts WHERE slug = ?').bind(slug).first();

    if (existing) {
      await c.env.DB.prepare(`
        UPDATE blog_posts 
        SET title = ?, body = ?, excerpt = ?, tags = ?, featured_springs = ?, published_at = ?, author = ?, updated_at = CURRENT_TIMESTAMP
        WHERE slug = ?
      `).bind(title, content, excerpt || '', tagsJson, featuredJson, publishedAt, authorName, slug).run();
    } else {
      await c.env.DB.prepare(`
        INSERT INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(title, slug, content, excerpt || '', tagsJson, featuredJson, publishedAt, authorName).run();
    }

    return c.json({ success: true, slug });
  });

  // GraphQL endpoint (deprecated - use REST instead)
  app.use(
    '/graphql',
    graphqlServer({
      schema,
      rootResolver: (c: any) => createRootResolver(c.env),
    })
  );

  // Health check endpoint
  app.get('/health', (c) =>
    c.json({ status: 'ok', timestamp: new Date().toISOString(), environment: c.env?.ENVIRONMENT })
  );

  // Root endpoint
  app.get('/', (c) => {
    return c.text(`
      SoakTheRockies API
      =================

      REST endpoints (recommended):
        GET  /api/springs      - List all springs
        GET  /api/springs/:slug - Get spring by slug
        GET  /api/blog         - List all blog posts
        GET  /api/blog/:slug   - Get blog post by slug
        POST /api/blog         - Create/update blog post

      GraphQL endpoint (deprecated):
        POST /graphql - GraphQL queries

      Health check: /health

      Powered by Cloudflare Workers + Hono + D1
    `);
  });

  return app;
};
