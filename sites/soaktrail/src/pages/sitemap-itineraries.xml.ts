import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const SITE_URL = 'https://soaktrail.com';

export const GET: APIRoute = async () => {
  let itineraries: any[] = [];

  try {
    itineraries = await getCollection('itineraries', ({ data }) => !data.draft);
  } catch {
    itineraries = [];
  }

  const now = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${itineraries
  .map(
    (it) => `  <url>
    <loc>${SITE_URL}/itineraries/${it.slug}</loc>
    <lastmod>${now}</lastmod>
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
