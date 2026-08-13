import type { APIRoute } from 'astro';

const SITE_URL = 'https://soaktrail.com';

export const GET: APIRoute = async () => {
  const now = new Date().toISOString();

  const sitemaps = [
    { loc: `${SITE_URL}/sitemap-pages.xml`, lastmod: now },
    { loc: `${SITE_URL}/sitemap-blog.xml`, lastmod: now },
    { loc: `${SITE_URL}/sitemap-minerals.xml`, lastmod: now },
    { loc: `${SITE_URL}/sitemap-regions.xml`, lastmod: now },
    { loc: `${SITE_URL}/sitemap-itineraries.xml`, lastmod: now },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps
  .map(
    (s) => `  <sitemap>
    <loc>${s.loc}</loc>
    <lastmod>${s.lastmod}</lastmod>
  </sitemap>`
  )
  .join('\n')}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
