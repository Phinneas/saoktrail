import { D1Database } from '@cloudflare/workers-types';
import { MinimaxClient, parseBlogOutput, markdownToTipTap } from '../lib/minimax.js';
import { PexelsClient } from '../lib/pexels.js';
import BlogQueue from '../../data/blog-content-queue.json';

const WOLLY_API_URL = 'https://wollycms.buzzuw2.workers.dev/api';

export interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  WOLLY_CMS_API_KEY: string;
  PEXELS_API_KEY: string;
  AI?: any;
  WOLLYCMS?: any;
}

// Publish a generated post to WollyCMS so it appears in the CMS dashboard
// and is served by the Astro frontend via wolly.pages.getBySlug()
async function publishToWollyCMS(
  env: Env,
  slug: string,
  title: string,
  body: string,
  excerpt: string,
  publishedAt: string,
  imageUrl: string | null
): Promise<void> {
  if (!env.WOLLY_CMS_API_KEY) {
    console.error('❌ WOLLY_CMS_API_KEY not set — skipping WollyCMS publish');
    return;
  }

  const apiKey = env.WOLLY_CMS_API_KEY;
  // Use service binding if available (avoids *.workers.dev 1042 error), otherwise fall back to fetch
  const wollyFetch = env.WOLLYCMS ? (url: string, init?: RequestInit) => env.WOLLYCMS.fetch(url, init) : fetch;

  // Check if page already exists in WollyCMS
  const listRes = await wollyFetch(`${WOLLY_API_URL}/content/pages?type=blog&limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const listData: any = await listRes.json();
  const existing = listData?.data?.find((p: any) => p.slug === slug);
  const method = existing ? 'PUT' : 'POST';
  const url = existing
    ? `${WOLLY_API_URL}/admin/pages/${existing.id}`
    : `${WOLLY_API_URL}/admin/pages`;

  const payload = {
    title,
    slug,
    typeId: 2,
    type: 'blog',
    status: 'published',
    published_at: publishedAt,
    fields: {
      excerpt,
      body,
      featured_image: imageUrl || '',
      site: 'soaktherockies',
    },
  };

  const res = await wollyFetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WollyCMS ${method} failed for ${slug}: ${err}`);
  }

  console.log(`📋 Published to WollyCMS: ${slug}`);
}

export async function handleScheduledEvent(event: any, env: Env, ctx: any) {
  console.log('🗓️ Running weekly blog generator scheduler...');

  // Record cron heartbeat so admin endpoints can confirm the trigger is firing
  try {
    await env.DB.prepare(
      `INSERT INTO system_state (key, value, updated_at) VALUES ('last_cron_run', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(event.scheduledTime || new Date().toISOString()).run();
    await env.DB.prepare(
      `UPDATE system_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now') WHERE key = 'cron_run_count'`
    ).run();
  } catch (hbErr: any) {
    // Non-fatal: system_state table may not exist yet; run migration first
    console.warn(`Heartbeat write failed: ${hbErr.message}`);
  }

  if (!env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not defined in environment.');
    return;
  }

  const minimax = new MinimaxClient(env.GEMINI_API_KEY);

  // Find the first topic not yet in D1
  let targetTopic = null;
  for (const topic of BlogQueue.topics) {
    const existing = await env.DB
      .prepare('SELECT id FROM blog_posts WHERE slug = ?')
      .bind(topic.slug)
      .first();
    if (!existing) {
      targetTopic = topic;
      break;
    }
  }

  if (!targetTopic) {
    console.log('✅ All topics in queue have been generated.');
    return;
  }

  console.log(`📝 Generating: ${targetTopic.title}`);

  try {
    const rawOutput = await minimax.generateBlogPost(targetTopic, BlogQueue.settings);
    const parsed = parseBlogOutput(rawOutput);
    const postTitle = targetTopic.title;
    const postExcerpt = parsed.excerpt || targetTopic.excerpt;
    const postBody = parsed.body;
    const tags = JSON.stringify(targetTopic.tags);
    const featuredSprings = JSON.stringify(targetTopic.featured_springs);
    const author = BlogQueue.settings.author || 'Soak the Rockies Team';
    const publishedAt = new Date().toISOString();

    // Fetch featured image from Pexels (or fall back to Workers AI)
    let imageUrl: string | null = null;
    let imageCredit = '';
    const imageQuery = parsed.imagePrompt || targetTopic.keyword || targetTopic.title;
    try {
      if (env.PEXELS_API_KEY) {
        const pexels = new PexelsClient(env.PEXELS_API_KEY);
        const img = await pexels.getBestImage(imageQuery);
        if (img) {
          imageUrl = img.imageUrl;
          imageCredit = `\n\n${img.creditMarkdown}`;
          console.log(`🖼️ Pexels image: ${imageUrl}`);
        }
      }
      if (!imageUrl && env.AI) {
        // Fall back to Workers AI image generation
        const aiResp = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
          prompt: imageQuery,
        });
        if (aiResp && aiResp.image) {
          // Store in R2 if available, otherwise skip
          console.log(`🖼️ Workers AI image generated but no R2 bucket configured — skipping`);
        }
      }
    } catch (imgErr: any) {
      console.error(`⚠️ Image fetch failed: ${imgErr.message}`);
    }

    // Prepend image to body if found
    const finalBody = imageUrl
      ? `![${imageQuery}](${imageUrl})${imageCredit}\n\n${postBody}`
      : postBody;

    // 1. Save to D1 (powers REST API and homepage blog preview)
    await env.DB.prepare(`
      INSERT INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      postTitle,
      targetTopic.slug,
      finalBody,
      postExcerpt,
      tags,
      featuredSprings,
      publishedAt,
      author,
      imageUrl
    ).run();

    console.log(`💾 Saved to D1: ${targetTopic.slug}`);

    // 2. Publish to WollyCMS (powers blog index + detail pages)
    await publishToWollyCMS(
      env,
      targetTopic.slug,
      postTitle,
      finalBody,
      postExcerpt,
      publishedAt,
      imageUrl
    );

    console.log(`✨ Done: ${postTitle}`);
  } catch (error: any) {
    const errMsg = `${error?.name || 'Error'}: ${error?.message || String(error)}`;
    const errStack = error?.stack ? `\n\nSTACK:\n${error.stack}` : '';
    console.error(`❌ Failed to generate post for ${targetTopic.slug}: ${errMsg}${errStack}`);
    // Insert failed placeholder with the actual error in the body so we can read it from D1
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author)
         VALUES (?, ?, ?, ?, '[]', '[]', ?, 'system-failed')`
      ).bind(
        targetTopic.title,
        targetTopic.slug,
        `ERROR: ${errMsg}${errStack}`,
        targetTopic.excerpt || '',
        new Date().toISOString()
      ).run();
      console.log(`⚠️ Marked as failed in D1 (with error details): ${targetTopic.slug}`);
    } catch (dbErr: any) {
      console.error(`❌ Also failed to mark ${targetTopic.slug} as failed: ${dbErr.message}`);
    }
  }
}
