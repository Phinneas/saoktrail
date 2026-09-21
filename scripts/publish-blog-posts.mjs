#!/usr/bin/env node
// Publish blog posts from scripts/blog-posts.mjs to the D1-backed blog API.
//
// The API worker (services/api) owns the blog_posts table that the Astro
// sites read at runtime. This script POSTs each post to the admin endpoint
// POST /api/blog, which upserts by slug and stores `site` so the post is
// visible on the matching regional blogroll (e.g. site: "soaktrail").
//
// Usage:
//   ADMIN_SECRET=<secret> node scripts/publish-blog-posts.mjs            # publish all
//   ADMIN_SECRET=<secret> node scripts/publish-blog-posts.mjs --dry-run  # validate + preview only
//   ADMIN_SECRET=<secret> node scripts/publish-blog-posts.mjs carbon-footprint-of-geothermal-travel-explained
//
// Env:
//   ADMIN_SECRET   (required unless the deployed worker has no secret set)
//   BLOG_API_URL   (default: https://soaktherockies-api.buzzuw2.workers.dev)

import posts from './blog-posts.mjs';

const API_URL =
  process.env.BLOG_API_URL || 'https://soaktherockies-api.buzzuw2.workers.dev';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

const dryRun = process.argv.includes('--dry-run');
const onlySlug = process.argv.slice(2).find((a) => !a.startsWith('--'));

const REQUIRED = ['title', 'slug', 'content', 'site'];

function validate(post, index) {
  const problems = [];
  for (const key of REQUIRED) {
    if (!post[key] || (typeof post[key] === 'string' && !post[key].trim())) {
      problems.push(`missing/empty "${key}"`);
    }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(post.slug || '')) {
    problems.push(`slug "${post.slug}" must be lowercase kebab-case`);
  }
  return { problems, label: `[${index + 1}] ${post.title || post.slug || 'unnamed'}` };
}

async function publish(post) {
  const headers = { 'Content-Type': 'application/json' };
  if (ADMIN_SECRET) headers['ADMIN_SECRET'] = ADMIN_SECRET;

  const res = await fetch(`${API_URL}/api/blog`, {
    method: 'POST',
    headers,
    body: JSON.stringify(post),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

const target = posts.filter((p) => !onlySlug || p.slug === onlySlug);
if (onlySlug && target.length === 0) {
  console.error(`❌ No post with slug "${onlySlug}" found in scripts/blog-posts.mjs`);
  console.error(`   Available slugs: ${posts.map((p) => p.slug).join(', ')}`);
  process.exit(1);
}

if (target.length === 0) {
  console.log('No posts to publish.');
  process.exit(0);
}

let hadError = false;

for (let i = 0; i < target.length; i++) {
  const post = target[i];
  const { problems, label } = validate(post, posts.indexOf(post));
  if (problems.length) {
    console.error(`❌ ${label} — ${problems.join('; ')}`);
    hadError = true;
    continue;
  }

  if (dryRun) {
    console.log(
      `\n— DRY RUN ${label} —\n` +
      `  slug: ${post.slug}\n` +
      `  site: ${post.site}\n` +
      `  title: ${post.title}\n` +
      `  excerpt: ${(post.excerpt || '').slice(0, 120)}\n` +
      `  tags: ${JSON.stringify(post.tags || [])}\n` +
      `  published_at: ${post.published_at || '(now)'}\n` +
      `  body: ${post.content.split('\n').length} lines / ${post.content.length} chars`
    );
    continue;
  }

  try {
    const result = await publish(post);
    console.log(`✅ ${label} → ${result && result.slug ? result.slug : 'ok'} (upsert)`);
  } catch (err) {
    console.error(`❌ ${label} — ${err.message}`);
    hadError = true;
  }
}

if (dryRun) {
  console.log('\nDry run complete — nothing was sent.');
}

process.exit(hadError ? 1 : 0);
