import type { APIRoute } from 'astro';

const SITE_URL = 'https://soaktrail.com';

export const GET: APIRoute = async () => {
  const now = new Date().toISOString();

  const pages = [
    { path: '', priority: '1.0', changefreq: 'daily' },
    { path: '/about', priority: '0.7', changefreq: 'monthly' },
    { path: '/blog', priority: '0.8', changefreq: 'weekly' },
    { path: '/trip-planner', priority: '0.8', changefreq: 'weekly' },
    { path: '/itineraries', priority: '0.7', changefreq: 'weekly' },
    { path: '/minerals', priority: '0.8', changefreq: 'weekly' },
    { path: '/minerals/chemistry-guide', priority: '0.7', changefreq: 'monthly' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
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
