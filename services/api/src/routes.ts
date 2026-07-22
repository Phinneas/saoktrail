import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { graphqlServer } from '@hono/graphql-server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema';
import { fieldResolvers, createRootResolver, type Bindings } from './resolvers';
import BlogQueue from '../../data/blog-content-queue.json';
import { MinimaxClient, parseBlogOutput, markdownToTipTap } from '../lib/minimax.js';
import { PexelsClient } from '../lib/pexels.js';

const schema = makeExecutableSchema({ typeDefs, resolvers: fieldResolvers });

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

  app.get('/api/blog', async (c) => {
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const results = await c.env.DB.prepare('SELECT * FROM blog_posts ORDER BY published_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all();
    return c.json({ data: results.results, error: false });
  });

  app.get('/api/blog/:slug', async (c) => {
    const slug = c.req.param('slug');
    const result = await c.env.DB.prepare('SELECT * FROM blog_posts WHERE slug = ?').bind(slug).first();
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

  // Chat endpoint
  app.post('/api/chat', async (c) => {
    // R-CHAT-5: Rate limiting
    const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    
    // Check rate limit
    let limitRecord = await c.env.DB.prepare('SELECT * FROM chat_rate_limits WHERE ip = ?').bind(ip).first();
    
    if (limitRecord) {
      if (now - (limitRecord.window_start as number) > oneHourMs) {
        // Reset window
        await c.env.DB.prepare('UPDATE chat_rate_limits SET count = 1, window_start = ? WHERE ip = ?').bind(now, ip).run();
      } else if ((limitRecord.count as number) >= 20) {
        return c.json({ reply: "Too many questions — come back in an hour and we'll find you a spring.", sources: [] }, 429);
      } else {
        // Increment
        await c.env.DB.prepare('UPDATE chat_rate_limits SET count = count + 1 WHERE ip = ?').bind(ip).run();
      }
    } else {
      await c.env.DB.prepare('INSERT INTO chat_rate_limits (ip, count, window_start) VALUES (?, 1, ?)').bind(ip, now).run();
    }

    const body = await c.req.json();
    const { messages = [], context = {} } = body;
    const { currentPage, currentSpringSlug } = context;

    let currentSpringContext = '';
    if (currentSpringSlug) {
      const spring = await c.env.DB.prepare('SELECT * FROM springs WHERE slug = ?').bind(currentSpringSlug).first();
      if (spring) {
        currentSpringContext = `\nThe user is currently viewing the page for the hot spring: ${(spring as any).name}. Details: ${JSON.stringify(spring)}`;
      }
    }

    const siteName = (c.env as any).CHAT_SITE_NAME || 'Soak the Rockies';
    const siteRegion = (c.env as any).CHAT_SITE_REGION || 'Rocky Mountains (CO, ID, MT, WY)';
    const topic = (c.env as any).CHAT_TOPIC || 'hot springs';

    const systemPrompt = `You are a helpful ${topic} guide for ${siteName}, a directory of ${topic} across the ${siteRegion} region.

You help visitors find ${topic}, understand access conditions, plan trips, and learn about the healing properties of geothermal waters. Answer warmly and knowledgeably. Use the search_springs and get_spring_details tools to look up real data from the site's database when answering specific questions.

If asked about something unrelated to ${topic} or outdoor recreation, politely redirect the conversation.

Current date: ${new Date().toISOString().split('T')[0]}
Site region: ${siteRegion}${currentSpringContext}`;

    const tools = [
      {
        name: "search_springs",
        description: "Search hot springs in the database by location, state, access type, development level, or temperature range",
        parameters: {
          type: "object",
          properties: {
            state: { type: "string", description: "Two-letter state abbreviation: CO, ID, MT, or WY" },
            access_type: { type: "string", enum: ["paved", "gravel", "4wd", "hike"] },
            development: { type: "string", enum: ["primitive", "developed", "resort"] },
            min_temp_f: { type: "number" },
            max_temp_f: { type: "number" },
            name_query: { type: "string", description: "Partial name match" },
            limit: { type: "number", description: "limit the search results to this many items, default 5" }
          }
        }
      },
      {
        name: "get_spring_details",
        description: "Get full details for a specific hot spring by its slug identifier",
        parameters: {
          type: "object",
          properties: {
            slug: { type: "string", description: "The spring's URL slug, e.g. 'strawberry-hot-springs'" }
          },
          required: ["slug"]
        }
      }
    ];

    const modelMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    try {
      let finalSources: any[] = [];
      const aiResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: modelMessages,
        tools: tools as any
      });

      let finalReply = aiResponse;
      
      // Check if it's a tool call
      if (aiResponse && (aiResponse as any).tool_calls && (aiResponse as any).tool_calls.length > 0) {
        const toolResultsMessage: any = { role: 'tool', content: '' };
        
        for (const toolCall of (aiResponse as any).tool_calls) {
           let args = toolCall.arguments;
           if (typeof args === 'string') {
             try { args = JSON.parse(args); } catch (e) {}
           }
           let result = null;

           if (toolCall.name === 'search_springs') {
             let sql = 'SELECT slug, name, state, temperature_f, access_type, development FROM springs WHERE 1=1';
             const params: any[] = [];
             
             if (args.state) { sql += ' AND state = ?'; params.push(args.state); }
             if (args.access_type) { sql += ' AND access_type = ?'; params.push(args.access_type); }
             if (args.development) { sql += ' AND development = ?'; params.push(args.development); }
             if (args.min_temp_f) { sql += ' AND temperature_f >= ?'; params.push(args.min_temp_f); }
             if (args.max_temp_f) { sql += ' AND temperature_f <= ?'; params.push(args.max_temp_f); }
             if (args.name_query) { sql += ' AND name LIKE ?'; params.push(`%${args.name_query}%`); }
             
             sql += ' LIMIT ?';
             params.push(args.limit || 5);
             
             const queryRes = await c.env.DB.prepare(sql).bind(...params).all();
             result = queryRes.results;
             
             for (const r of (result as any[])) {
               finalSources.push({ name: r.name, slug: r.slug, type: 'spring' });
             }
           } else if (toolCall.name === 'get_spring_details') {
             const queryRes = await c.env.DB.prepare('SELECT slug, name, state, temperature_f, access_type, development, description, lat, lon FROM springs WHERE slug = ?').bind(args.slug).first();
             result = queryRes;
             if (result) {
               finalSources.push({ name: (result as any).name, slug: (result as any).slug, type: 'spring' });
             }
           }

           toolResultsMessage.content += `Tool ${toolCall.name} returned: ${JSON.stringify(result)}\n`;
        }

        // Second pass
        modelMessages.push(aiResponse as any); // The assistant's tool call request
        modelMessages.push(toolResultsMessage);
        
        const finalAIResponse = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: modelMessages
        });
        
        finalReply = finalAIResponse;
      }

      const replyText = typeof finalReply === 'string' ? finalReply : (finalReply as any).response;
      
      // Deduplicate sources
      const uniqueSources = finalSources.filter((v, i, a) => a.findIndex(t => (t.slug === v.slug)) === i);

      return c.json({ reply: replyText, sources: uniqueSources });
      
    } catch (error: any) {
      console.error('AI Error:', error);
      return c.json({ reply: "I'm sorry, I'm having trouble connecting to my knowledge base right now.", sources: [] }, 500);
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
