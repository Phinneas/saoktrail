import type { APIRoute } from 'astro';
import cityIndex from '../data/cities_index.json';

const SITE_URL = 'https://soaktrail.com';

export const GET: APIRoute = async () => {
  const now = new Date().toISOString();

  const urls = Object.keys(cityIndex).map((slug) => ({
    loc: `${SITE_URL}/near/${slug}`,
    lastmod: now,
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
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
