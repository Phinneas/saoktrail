import type { APIRoute } from 'astro';
import { MINERALS } from '../lib/minerals';

const SITE_URL = 'https://soaktrail.com';

export const GET: APIRoute = async () => {
  const now = new Date().toISOString();

  const urls = MINERALS.map((m) => ({
    loc: `${SITE_URL}/minerals/${m.key}`,
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
    <priority>0.7</priority>
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
