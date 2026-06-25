// Import orphaned generated blog posts into WollyCMS tagged as soaktrail
// Usage: WOLLY_API_KEY=your_key node scripts/import-orphaned-posts.js

const fs = require('fs');
const path = require('path');

const WOLLY_API_URL = 'https://wollycms.buzzuw2.workers.dev/api';
const WOLLY_API_KEY = process.env.WOLLY_API_KEY || process.env.WOLLY_CMS_API;

if (!WOLLY_API_KEY) {
  console.error('❌ Set WOLLY_API_KEY or WOLLY_CMS_API environment variable');
  process.exit(1);
}

// Read generated blogs from both possible locations
const possiblePaths = [
  path.join(__dirname, '../../data/generated-blogs.json'),
  path.join(__dirname, '../../../soaktherockies/data/generated-blogs.json'),
  path.join(__dirname, '../../../desertsoak/desert/data/generated-blogs.json'),
];

let posts = [];
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(data)) {
        posts = data;
        console.log(`📖 Read ${data.length} posts from ${p}`);
        break;
      }
    } catch (e) {
      console.warn(`⚠️ Could not read ${p}: ${e.message}`);
    }
  }
}

if (posts.length === 0) {
  console.error('❌ No generated-blogs.json found');
  process.exit(1);
}

async function wollyFetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WOLLY_API_KEY}`,
      ...init.headers,
    },
  });
  return res;
}

async function importPost(post) {
  // Check if already exists
  const listRes = await wollyFetch(`${WOLLY_API_URL}/content/pages?type=blog&limit=100`);
  const listData = await listRes.json();
  const existing = listData?.data?.find((p) => p.slug === post.slug && p.fields?.site === 'soaktrail');

  const payload = {
    title: post.title,
    slug: post.slug,
    typeId: 2,
    type: 'blog',
    status: 'published',
    published_at: new Date().toISOString(),
    fields: {
      excerpt: post.excerpt || '',
      body: post.content || '',
      site: 'soaktrail',
    },
  };

  const method = existing ? 'PUT' : 'POST';
  const url = existing
    ? `${WOLLY_API_URL}/admin/pages/${existing.id}`
    : `${WOLLY_API_URL}/admin/pages`;

  const res = await wollyFetch(url, {
    method,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ ${method} failed for ${post.slug}: ${res.status} - ${err}`);
    return false;
  }

  console.log(`✅ ${method === 'PUT' ? 'Updated' : 'Created'}: ${post.slug}`);
  return true;
}

async function main() {
  console.log(`🚀 Importing ${posts.length} orphaned posts as soaktrail...\n`);

  for (const post of posts) {
    await importPost(post);
  }

  console.log('\n✨ Done!');
}

main().catch(console.error);
