import { D1Database } from '@cloudflare/workers-types';
import { MinimaxClient, parseBlogOutput } from '../lib/minimax.js';
import { PexelsClient } from '../lib/pexels.js';
import { listOpenTasks, markTaskComplete, commentOnTask } from '../lib/asana.js';

export interface Env {
  DB: D1Database;
  GLM_API_KEY: string;
  PEXELS_API_KEY: string;
  ASANA_PAT?: string;
  ASANA_PROJECT_DESERTSOAK?: string;
  ASANA_PROJECT_SOAKCOLORADO?: string;
  ASANA_PROJECT_SOAKTHEROCKIES?: string;
  ASANA_PROJECT_ALASKAHOTSPRINGS?: string;
  ASANA_PROJECT_SHASTAHOTSPRINGS?: string;
  ASANA_PROJECT_WASHINGTONHOTSPRINGS?: string;
  // Rewrites go through the humanizer's fact-checked /v1/retrofit (Exa + Tavily).
  HUMANIZER_URL?: string;
  HUMANIZER_API_KEY?: string;
  // Service binding to humanizer-api. Worker-to-worker calls over workers.dev are blocked (error 1042).
  HUMANIZER?: { fetch: typeof fetch };
  ASANA_PROJECT_SOAKTRAIL?: string;
  AUTOPOSTER_ENABLED?: string;
  AI?: any;
}

interface SiteProject {
  site: string;
  siteName: string;
  projectGid?: string;
  // Posts to generate per cron run (default 1). Each pass re-reads Asana and the
  // published-post dedup check, so the next pass picks the next unpublished task.
  perRun?: number;
}

// Hard rule: no years in post titles or URL slugs (they go stale every January).
// Removes "(2026)", "[2026 Data]", "for 2025", "in 2026" and bare years, then tidies.
export function stripYears(s: string): string {
  return String(s)
    .replace(/\s*[\(\[][^\)\]]*\b20[0-4]\d\b[^\)\]]*[\)\]]/g, '')
    .replace(/\s+(?:for|in|of)\s+20[0-4]\d\b/gi, '')
    .replace(/\b20[0-4]\d\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([:,.!?])/g, '$1')
    .replace(/[\s:,\-–]+$/g, '')
    .replace(/^[\s:,\-–]+/g, '')
    .trim();
}

// Site slug -> folder in the monorepo, for reading a committed MDX post to rewrite.
const SITE_DIRS: Record<string, string> = {
  desertsoak: 'desert',
  soakcolorado: 'soakcolorados',
  soaktherockies: 'soaktherockies',
  alaskahotsprings: 'soakalaska',
  shastahotsprings: 'mountshasthotsprings',
  soaktrail: 'soaktrail',
  washingtonhotsprings: 'wa_hot',
};
const REPO_RAW = 'https://raw.githubusercontent.com/Phinneas/saoktrail/main';

// Place hint added to every fact-check search.
const SITE_REGIONS: Record<string, string> = {
  desertsoak: 'Utah Nevada Arizona',
  soakcolorado: 'Colorado',
  soaktherockies: 'Idaho Montana Wyoming',
  alaskahotsprings: 'Alaska',
  shastahotsprings: 'Northern California Southern Oregon',
  soaktrail: 'United States',
  washingtonhotsprings: 'Washington state',
};

// The post to rewrite: a /blog/<slug> URL or a bare slug, in the notes or name.
export function rewriteSlugFrom(...texts: string[]): string | null {
  for (const t of texts) {
    const url = String(t || '').match(/\/blog\/([a-z0-9][a-z0-9-]*)/i);
    if (url) return url[1].toLowerCase();
  }
  for (const t of texts) {
    const bare = String(t || '').match(/^\s*([a-z0-9]+(?:-[a-z0-9]+)+)\s*$/m);
    if (bare) return bare[1];
  }
  return null;
}

// Split MDX/MD frontmatter. Returns the title, image and date it declares, and
// the body with frontmatter and import/export lines removed.
export function splitFrontmatter(src: string) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = m ? m[1] : '';
  const get = (k: string) => {
    const r = fm.match(new RegExp(`^${k}:\\s*["']?(.*?)["']?\\s*$`, 'm'));
    return r ? r[1] : '';
  };
  const body = (m ? src.slice(m[0].length) : src)
    .split('\n').filter((l) => !/^\s*(import|export)\s/.test(l)).join('\n').trim();
  return { title: get('title'), image: get('image'), date: get('date'), body };
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
  // Kill switch: the autoposter only runs when explicitly enabled.
  if (env.AUTOPOSTER_ENABLED !== 'true') {
    console.log('⏸️ Autoposter disabled (AUTOPOSTER_ENABLED != "true"); skipping run.');
    return;
  }

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

  if (!env.GLM_API_KEY) {
    console.error('❌ GLM_API_KEY is not defined in environment.');
    return;
  }
  if (!env.ASANA_PAT) {
    console.error('❌ ASANA_PAT is not defined — cannot read Asana tasks.');
    return;
  }

  const siteList: SiteProject[] = [
    { site: 'desertsoak', siteName: 'Desert Soak', projectGid: env.ASANA_PROJECT_DESERTSOAK },
    { site: 'soakcolorado', siteName: 'Soak Colorado', projectGid: env.ASANA_PROJECT_SOAKCOLORADO, perRun: 2 }, // catch-up pace, Oct 2026
    { site: 'soaktherockies', siteName: 'Soak the Rockies', projectGid: env.ASANA_PROJECT_SOAKTHEROCKIES },
    { site: 'alaskahotsprings', siteName: 'Alaska Hot Springs', projectGid: env.ASANA_PROJECT_ALASKAHOTSPRINGS },
    { site: 'shastahotsprings', siteName: 'Shasta Hot Springs', projectGid: env.ASANA_PROJECT_SHASTAHOTSPRINGS },
    { site: 'soaktrail', siteName: 'Soak Trail', projectGid: env.ASANA_PROJECT_SOAKTRAIL },
    { site: 'washingtonhotsprings', siteName: 'Washington Hot Springs', projectGid: env.ASANA_PROJECT_WASHINGTONHOTSPRINGS },
  ];
  const queue: SiteProject[] = siteList.flatMap((s) => Array(Math.max(1, s.perRun ?? 1)).fill(s));

  // Scheduled runs write ONE post per cron slot so each run stays well under
  // Cloudflare's ~15 min limit (GLM takes 6-8 min per post). Slots start at
  // SLOT_START_UTC_HOUR and repeat every SLOT_MINUTES (see crons in wrangler.toml).
  // Manual runs (admin trigger) can pass event.site to run just that site.
  const SLOT_START_UTC_HOUR = 9;
  const SLOT_MINUTES = 20;
  let sites: SiteProject[] = queue;
  if (event.site) {
    sites = queue.filter((s) => s.site === event.site);
    if (sites.length === 0) {
      console.log(`⏭️ Unknown site "${event.site}"; nothing to run.`);
      return;
    }
  } else if (event.cron) {
    const t = new Date(event.scheduledTime || Date.now());
    const mins = t.getUTCHours() * 60 + t.getUTCMinutes() - SLOT_START_UTC_HOUR * 60;
    const slot = Math.floor(mins / SLOT_MINUTES);
    if (slot < 0 || slot >= queue.length) {
      console.log(`⏭️ Cron slot ${slot} has no site assigned; nothing to run.`);
      return;
    }
    sites = [queue[slot]];
    console.log(`🕐 Cron slot ${slot}: ${sites[0].site}`);
  }

  const minimax = new MinimaxClient(env.GLM_API_KEY);

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
      if (target.kind === 'rewrite') {
        await runRewrite(env, minimax, siteCfg, target);
        const done = await markTaskComplete(env.ASANA_PAT, target.gid);
        console.log(done
          ? `✅ [${siteCfg.site}] Marked rewrite task complete: ${target.gid}`
          : `⚠️ Rewrite saved but failed to mark Asana task ${target.gid} complete.`);
        continue;
      }

      const rawOutput = await minimax.generateBlogPostFromBrief({
        siteName: siteCfg.siteName,
        taskName: target.name,
        notes: target.notes,
      });
      const parsed = parseBlogOutput(rawOutput);
      const postTitle = stripYears(parsed.title || target.name) || stripYears(target.name);
      let slug = slugify(postTitle) || slugify(stripYears(target.name)) || target.gid;
      // Guarantee slug uniqueness in D1
      const existingSlug = await env.DB
        .prepare('SELECT id FROM blog_posts WHERE slug = ?')
        .bind(slug)
        .first();
      if (existingSlug) slug = `${slug}-${String(target.gid).slice(-6)}`;

      const postExcerpt = parsed.excerpt || '';
      // Second pass: humanize the generated body to strip AI-writing patterns.
      // Non-fatal — fall back to the raw body if the rewrite call fails.
      let postBody = parsed.body;
      try {
        const humanized = await minimax.humanizeBody(parsed.body, siteCfg.siteName);
        if (humanized && humanized.trim()) {
          console.log(`✍️ [${siteCfg.site}] Humanized body (${parsed.body.length} -> ${humanized.length} chars).`);
          postBody = humanized;
        }
      } catch (hErr: any) {
        console.warn(`⚠️ [${siteCfg.site}] Humanize pass failed, using raw body: ${hErr.message}`);
      }
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


// Rewrite an existing post (a "Rewrite:" Asana task). The source is the site's
// D1 post with that slug, or else its committed MDX file. The result is saved to
// D1 under the SAME slug; when the source was MDX it is flagged replaces_mdx so
// the site shows it instead of the file. The URL never changes.
export async function runRewrite(env: Env, minimax: any, siteCfg: SiteProject, target: any) {
  const slug = rewriteSlugFrom(target.notes, target.name);
  if (!slug) throw new Error('Rewrite task has no /blog/<slug> URL or slug in its notes or name');

  const row: any = await env.DB.prepare('SELECT * FROM blog_posts WHERE slug = ?').bind(slug).first();
  if (row && row.site !== siteCfg.site) {
    throw new Error(`Slug "${slug}" belongs to ${row.site}, not ${siteCfg.site}`);
  }

  let originalTitle = '';
  let originalBody = '';
  let originalImage: string | null = null;
  let originalDate: string | null = null;
  let fromMdx = false;

  const dir = SITE_DIRS[siteCfg.site];
  if (dir) {
    for (const ext of ['mdx', 'md']) {
      const res = await fetch(`${REPO_RAW}/sites/${dir}/src/content/blog/${slug}.${ext}`);
      if (res.ok) {
        const fm = splitFrontmatter(await res.text());
        originalTitle = fm.title || slug;
        originalBody = fm.body;
        originalImage = /^https?:\/\//.test(fm.image) ? fm.image : null;
        originalDate = fm.date || null;
        fromMdx = true;
        break;
      }
    }
  }
  if (!fromMdx && row && row.status === 'published') {
    originalTitle = row.title;
    // Drop the leading image + credit the autoposter adds; it is re-added below.
    originalBody = String(row.body || '').replace(/^!\[[^\]]*\]\([^)]*\)\s*(\n\*?Photo[^\n]*\n)?/, '').trim();
    originalImage = row.image_url || null;
    originalDate = row.published_at || null;
  }
  if (!originalBody) throw new Error(`Rewrite target not found for ${siteCfg.site}: ${slug}`);

  console.log(`♻️ [${siteCfg.site}] Retrofitting ${slug} (${fromMdx ? 'MDX' : 'D1'} source, ${originalBody.length} chars)`);
  // Fact-checked rewrite. No unverified fallback: if the humanizer is missing or fails,
  // the task stays open and retries next run.
  if (!env.HUMANIZER_URL || !env.HUMANIZER_API_KEY) {
    throw new Error('HUMANIZER_URL / HUMANIZER_API_KEY not set: rewrites need the fact-checked retrofit');
  }
  const call = env.HUMANIZER ? env.HUMANIZER.fetch.bind(env.HUMANIZER) : fetch;
  const res = await call(`${env.HUMANIZER_URL.replace(/\/$/, '')}/v1/retrofit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.HUMANIZER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: originalTitle,
      body: originalBody,
      brief: target.notes,
      site: siteCfg.siteName,
      region: SITE_REGIONS[siteCfg.site],
    }),
  });
  if (!res.ok) throw new Error(`Retrofit HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const rf: any = await res.json();
  if (!rf.body || String(rf.body).length < 400) throw new Error('Retrofit returned an empty body');
  const parsed = { title: rf.title, excerpt: rf.excerpt, body: rf.body, imagePrompt: '' };
  const title = stripYears(parsed.title || originalTitle) || stripYears(originalTitle);
  // No GLM humanize pass here: it could reintroduce facts the retrofit removed.
  const body = parsed.body;
  if (rf.report) await commentOnTask(env.ASANA_PAT, target.gid, rf.report);

  let imageUrl = originalImage;
  let credit = '';
  if (!imageUrl && env.PEXELS_API_KEY) {
    try {
      const img = await new PexelsClient(env.PEXELS_API_KEY).getBestImage(parsed.imagePrompt || title);
      if (img) { imageUrl = img.imageUrl; credit = `\n\n${img.creditMarkdown}`; }
    } catch (imgErr: any) {
      console.error(`⚠️ Image fetch failed: ${imgErr.message}`);
    }
  }
  const finalBody = imageUrl ? `![${title}](${imageUrl})${credit}\n\n${body}` : body;
  const publishedAt = originalDate ? new Date(originalDate).toISOString() : new Date().toISOString();

  if (row) {
    await env.DB.prepare(
      `UPDATE blog_posts SET title = ?, body = ?, excerpt = ?, image_url = ?, asana_task_gid = ?,
         status = 'published', replaces_mdx = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(title, finalBody, parsed.excerpt || '', imageUrl, target.gid, fromMdx ? 1 : Number(row.replaces_mdx) || 0, row.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author, image_url, site, asana_task_gid, status, replaces_mdx)
       VALUES (?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, 'published', ?)`
    ).bind(title, slug, finalBody, parsed.excerpt || '', publishedAt, siteCfg.siteName, imageUrl, siteCfg.site, target.gid, fromMdx ? 1 : 0).run();
  }
  console.log(`💾 [${siteCfg.site}] Rewrite saved: ${slug}`);
}
