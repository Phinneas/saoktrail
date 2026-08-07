import { D1Database } from '@cloudflare/workers-types';
import { MinimaxClient, parseBlogOutput } from '../lib/minimax.js';
import { PexelsClient } from '../lib/pexels.js';
import { listOpenTasks, markTaskComplete } from '../lib/asana.js';

export interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  PEXELS_API_KEY: string;
  ASANA_PAT?: string;
  ASANA_PROJECT_DESERTSOAK?: string;
  ASANA_PROJECT_SOAKCOLORADO?: string;
  ASANA_PROJECT_SOAKTHEROCKIES?: string;
  ASANA_PROJECT_ALASKAHOTSPRINGS?: string;
  AI?: any;
}

interface SiteProject {
  site: string;
  siteName: string;
  projectGid?: string;
}

function slugify(s: string): string {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function handleScheduledEvent(event: any, env: Env, ctx: any) {
  console.log('🗓️ Running Asana-driven blog generator scheduler...');

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
  if (!env.ASANA_PAT) {
    console.error('❌ ASANA_PAT is not defined — cannot read Asana tasks.');
    return;
  }

  const sites: SiteProject[] = [
    { site: 'desertsoak', siteName: 'Desert Soak', projectGid: env.ASANA_PROJECT_DESERTSOAK },
    { site: 'soakcolorado', siteName: 'Soak Colorado', projectGid: env.ASANA_PROJECT_SOAKCOLORADO },
    { site: 'soaktherockies', siteName: 'Soak the Rockies', projectGid: env.ASANA_PROJECT_SOAKTHEROCKIES },
    { site: 'alaskahotsprings', siteName: 'Alaska Hot Springs', projectGid: env.ASANA_PROJECT_ALASKAHOTSPRINGS },
  ];

  const minimax = new MinimaxClient(env.GEMINI_API_KEY);

  for (const siteCfg of sites) {
    if (!siteCfg.projectGid) {
      console.log(`⏭️ No Asana project GID configured for ${siteCfg.site}; skipping.`);
      continue;
    }

    let tasks: any[] = [];
    try {
      tasks = await listOpenTasks(env.ASANA_PAT, siteCfg.projectGid);
    } catch (e: any) {
      console.error(`❌ Asana fetch failed for ${siteCfg.site}: ${e.message}`);
      continue;
    }
    if (tasks.length === 0) {
      console.log(`✅ No open Asana tasks for ${siteCfg.site}.`);
      continue;
    }

    // Pick the first task not already published (dedup by asana_task_gid + status).
    let target: any = null;
    for (const t of tasks) {
      const done = await env.DB
        .prepare('SELECT id FROM blog_posts WHERE asana_task_gid = ? AND status = ?')
        .bind(t.gid, 'published')
        .first();
      if (!done) {
        target = t;
        break;
      }
    }
    if (!target) {
      console.log(`✅ All open Asana tasks for ${siteCfg.site} already published.`);
      continue;
    }

    console.log(`📝 [${siteCfg.site}] Generating from Asana task: ${target.name}`);

    try {
      const rawOutput = await minimax.generateBlogPostFromBrief({
        siteName: siteCfg.siteName,
        taskName: target.name,
        notes: target.notes,
      });
      const parsed = parseBlogOutput(rawOutput);
      const postTitle = parsed.title || target.name;
      let slug = slugify(postTitle) || slugify(target.name) || target.gid;
      // Guarantee slug uniqueness in D1
      const existingSlug = await env.DB
        .prepare('SELECT id FROM blog_posts WHERE slug = ?')
        .bind(slug)
        .first();
      if (existingSlug) slug = `${slug}-${String(target.gid).slice(-6)}`;

      const postExcerpt = parsed.excerpt || '';
      const postBody = parsed.body;
      const publishedAt = new Date().toISOString();

      // Featured image from Pexels (optional)
      let imageUrl: string | null = null;
      let imageCredit = '';
      const imageQuery = parsed.imagePrompt || target.name;
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
      } catch (imgErr: any) {
        console.error(`⚠️ Image fetch failed: ${imgErr.message}`);
      }

      const finalBody = imageUrl
        ? `![${imageQuery}](${imageUrl})${imageCredit}\n\n${postBody}`
        : postBody;

      // Save to D1 — this is the single source of truth the sites read at runtime.
      await env.DB.prepare(`
        INSERT INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author, image_url, site, asana_task_gid, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        postTitle,
        slug,
        finalBody,
        postExcerpt,
        '[]',
        '[]',
        publishedAt,
        siteCfg.siteName,
        imageUrl,
        siteCfg.site,
        target.gid,
        'published'
      ).run();

      console.log(`💾 [${siteCfg.site}] Saved to D1: ${slug}`);

      // Mark the Asana task complete so it isn't processed again next run.
      const completed = await markTaskComplete(env.ASANA_PAT, target.gid);
      if (!completed) {
        console.warn(`⚠️ Post saved but failed to mark Asana task ${target.gid} complete — dedup will skip it next run.`);
      } else {
        console.log(`✅ [${siteCfg.site}] Marked Asana task complete: ${target.gid}`);
      }
    } catch (error: any) {
      const errMsg = `${error?.name || 'Error'}: ${error?.message || String(error)}`;
      const errStack = error?.stack ? `\n\nSTACK:\n${error.stack}` : '';
      console.error(`❌ [${siteCfg.site}] Failed for Asana task ${target.gid}: ${errMsg}${errStack}`);
      // Keep a single inspectable 'system-failed' row per task; do NOT mark the
      // Asana task complete so it retries on the next cron run.
      try {
        await env.DB
          .prepare('DELETE FROM blog_posts WHERE asana_task_gid = ? AND status = ?')
          .bind(target.gid, 'system-failed')
          .run();
        await env.DB.prepare(
          `INSERT INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author, image_url, site, asana_task_gid, status)
           VALUES (?, ?, ?, ?, '[]', '[]', ?, 'system-failed', NULL, ?, ?, 'system-failed')`
        ).bind(
          target.name,
          `asana-failed-${target.gid}`,
          `ERROR: ${errMsg}${errStack}`,
          '',
          new Date().toISOString(),
          siteCfg.site,
          target.gid
        ).run();
        console.log(`⚠️ Recorded system-failed for ${target.gid} (will retry next run).`);
      } catch (dbErr: any) {
        console.error(`❌ Also failed to record failure: ${dbErr.message}`);
      }
    }
  }

  console.log('🗓️ Scheduler run complete.');
}
