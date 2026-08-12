import type { APIRoute } from 'astro';
import { getBlogPosts } from '../lib/d1Blog';

const SITE_SLUG = 'soaktrail';

export const GET: APIRoute = async () => {
  const siteUrl = 'https://soaktrail.com';

  const staticPages = [
    '',
    '/blog',
    '/trip-planner',
    '/minerals',
    '/minerals/chemistry-guide',
  ];

  let blogPosts: any[] = [];

  try {
    blogPosts = (await getBlogPosts(SITE_SLUG)).filter((p: any) => p.slug !== 'hot-spring-chemistry-guide');
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
      lastmod: post.updated_at || post.published_at || new Date().toISOString(),
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
