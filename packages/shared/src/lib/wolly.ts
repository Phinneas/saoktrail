import { siteConfig } from "@site/config";

const CMS_API_URL = import.meta.env.CMS_API_URL || "https://wollycms.buzzuw2.workers.dev/api/content";
const SITE_SLUG = siteConfig.wollySiteSlug;

interface WollyPage {
  id: number;
  title: string;
  slug: string;
  status: string;
  fields: Record<string, any>;
  meta: { created_at: string; updated_at: string; published_at: string | null };
}

async function fetchAPI(path: string) {
  const res = await fetch(`${CMS_API_URL}${path}`);
  if (!res.ok) throw new Error(`WollyCMS API error: ${res.status}`);
  return res.json();
}

async function fetchAllBlogPages(): Promise<WollyPage[]> {
  const allPages: WollyPage[] = [];
  let offset = 0;
  const limit = 50;
  // WollyCMS content API caps at 50 per request; paginate to get all posts
  while (true) {
    const data = await fetchAPI(`/pages?type=blog&status=published&limit=${limit}&offset=${offset}`);
    const pages: WollyPage[] = (data.data || []).filter(
      (p: WollyPage) => p.fields?.site === SITE_SLUG
    );
    allPages.push(...pages);
    const total = data.meta?.total || 0;
    offset += limit;
    if (offset >= total) break;
  }
  return allPages;
}

export async function getWollyBlogEntries() {
  const pages = await fetchAllBlogPages();
  return pages.map(formatAsBlogEntry);
}

export async function getWollyBlogEntry(slug: string) {
  try {
    const data = await fetchAPI(`/pages/${slug}`);
    const page: WollyPage = data.data;
    if (!page || page.status !== "published" || page.fields?.site !== SITE_SLUG) {
      return null;
    }
    return formatAsBlogEntry(page);
  } catch (err) {
    return null;
  }
}

function formatAsBlogEntry(page: WollyPage) {
  const rawBody = page.fields.body || "";
  const htmlBody = bodyToHtml(rawBody);
  const headings = extractHeadingsFromHtml(htmlBody);

  return {
    id: page.slug,
    collection: "blog",
    data: {
      title: page.title,
      description: page.fields.excerpt || "",
      date: page.meta.published_at || page.meta.created_at,
      image: page.fields.featured_image ? { src: page.fields.featured_image } : undefined,
      categories: page.fields.categories || [],
      tags: page.fields.tags || [],
      draft: page.status !== "published",
    },
    body: typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody),
    htmlBody,
    headings,
    slug: page.slug,
  };
}

function bodyToHtml(body: any): string {
  if (typeof body === "string") {
    if (body.trimStart().startsWith("<")) return body;
    return `<p>${body}</p>`;
  }
  if (typeof body === "object" && body !== null && body.type === "doc") {
    return renderTipTap(body);
  }
  return String(body || "");
}

function renderTipTap(node: any): string {
  if (!node || !node.type) return "";

  if (node.type === "doc") {
    return (node.content || []).map(renderTipTap).join("");
  }

  if (node.type === "paragraph") {
    const text = (node.content || []).map(renderTipTap).join("");
    return `<p>${text}</p>`;
  }

  if (node.type === "heading") {
    const level = node.attrs?.level || 2;
    const text = (node.content || []).map(renderTipTap).join("");
    const slug = text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
    return `<h${level} id="${slug}">${text}</h${level}>`;
  }

  if (node.type === "text") {
    let text = node.text || "";
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "bold") text = `<strong>${text}</strong>`;
        if (mark.type === "italic") text = `<em>${text}</em>`;
        if (mark.type === "code") text = `<code>${text}</code>`;
        if (mark.type === "link") text = `<a href="${mark.attrs?.href || "#"}">${text}</a>`;
      }
    }
    return text;
  }

  if (node.content) {
    return node.content.map(renderTipTap).join("");
  }

  return "";
}

function extractHeadingsFromHtml(html: string) {
  const headings: { depth: number; slug: string; text: string }[] = [];
  const regex = /<h([1-3])(?:\s+id="([^"]*)")?>([^<]*)<\/h[1-3]>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const depth = parseInt(match[1]);
    const slug = match[2] || match[3].toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
    const text = match[3];
    headings.push({ depth, slug, text });
  }
  return headings;
}
