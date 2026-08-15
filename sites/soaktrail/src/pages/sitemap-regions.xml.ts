import type { APIRoute } from 'astro';
import { REGIONS } from '../lib/regions';

const SITE_URL = 'https://soaktrail.com';

export const GET: APIRoute = async () => {
  const now = new Date().toISOString();

  const urls = REGIONS.map((r) => ({
    loc: `${SITE_URL}/trip-planner/${r.slug}`,
    lastmod: now,
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
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
