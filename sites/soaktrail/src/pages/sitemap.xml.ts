import type { APIRoute } from 'astro';
import { wolly } from '../lib/wolly';

const SITE_SLUG = 'soaktrail';

export const GET: APIRoute = async () => {
  const siteUrl = 'https://soaktrail.com';

  const staticPages = [
    '',
    '/blog',
  ];

  let blogPosts: any[] = [];

  try {
    const allPosts: any[] = [];
    let offset = 0;
    const limit = 50;
    while (true) {
      const result = await wolly.pages.list({ type: 'blog', sort: 'published_at:desc', status: 'published', limit, offset });
      const filtered = result.data.filter((post: any) => post.fields?.site === SITE_SLUG);
      allPosts.push(...filtered);
      const total = result.meta?.total || 0;
      offset += limit;
      if (offset >= total) break;
    }
    blogPosts = allPosts;
  } catch {
    blogPosts = [];
  }

  const urls = [
    ...staticPages.map((path) => ({
      loc: `${siteUrl}${path}`,
      lastmod: new Date().toISOString(),
      changefreq: path === '' ? 'daily' : 'weekly',
      priority: path === '' ? '1.0' : '0.8',
    })),
    ...blogPosts.map((post) => ({
      loc: `${siteUrl}/blog/${post.slug}`,
      lastmod: post.meta?.updated_at || post.meta?.published_at || new Date().toISOString(),
      changefreq: 'monthly',
      priority: '0.6',
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
