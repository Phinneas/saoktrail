import type { APIRoute } from 'astro';
import { getBlogPosts } from '../lib/d1Blog';

const SITE_URL = 'https://soaktrail.com';
const SITE_SLUG = 'soaktrail';

export const GET: APIRoute = async () => {
  let posts: any[] = [];

  try {
    posts = (await getBlogPosts(SITE_SLUG)).filter(
      (p: any) => p.slug !== 'hot-spring-chemistry-guide'
    );
  } catch {
    posts = [];
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${posts
  .map(
    (post) => `  <url>
    <loc>${SITE_URL}/blog/${post.slug}</loc>
    <lastmod>${post.updated_at || post.published_at || new Date().toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
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
