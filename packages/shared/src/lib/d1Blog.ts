// Read blog posts from the soaktherockies-api Worker (D1-backed) at request time.
//
// Two transport modes:
// - Service binding (`API`): when `api` is provided, calls go over the internal
//   Cloudflare service binding (avoids *.workers.dev 1042). Used if the sites
//   are ever moved to Workers with an `API` binding declared in wrangler config.
// - Public fetch fallback: when `api` is undefined (the current Pages deploy
//   model, where wrangler.jsonc bindings don't apply), calls go to the API
//   Worker's public URL. This mirrors wa_hot's proven Pages→*.workers.dev fetch.
//
// `api` is `Astro.locals.runtime.env.API` from the page (undefined on Pages).

import { marked } from "marked";
import { slugify } from "./textConverter";

export type ApiFetcher = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
};

const INTERNAL_HOST = "https://soaktrail-api.internal";
const PUBLIC_API_URL =
  (import.meta as any).env?.BLOG_API_URL ||
  "https://soaktherockies-api.buzzuw2.workers.dev";

async function apiFetch<T = any>(api: ApiFetcher | undefined, path: string): Promise<T> {
  const url = api ? `${INTERNAL_HOST}${path}` : `${PUBLIC_API_URL}${path}`;
  const res = api ? await api.fetch(url) : await fetch(url);
  if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

function parseJsonArray(v: any): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Add id attributes to <h1-3> so TOC anchor links resolve (marked doesn't add them).
function addHeadingIds(html: string): string {
  return html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_m, level, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, "").trim();
    const id = slugify(text);
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
}

function extractHeadings(html: string) {
  const headings: { depth: number; slug: string; text: string }[] = [];
  const regex = /<h([1-3])(?:\s+id="([^"]*)")?>([^<]*)<\/h[1-3]>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const depth = parseInt(m[1]);
    const text = m[3];
    headings.push({ depth, slug: m[2] || slugify(text), text });
  }
  return headings;
}

function formatD1Entry(row: any) {
  const rawBody = row.body || "";
  const htmlBody = addHeadingIds(marked.parse(rawBody) as string);
  return {
    id: row.slug,
    collection: "blog",
    data: {
      title: row.title,
      description: row.excerpt || "",
      date: row.published_at || new Date().toISOString(),
      image: row.image_url ? { src: row.image_url } : undefined,
      categories: [] as string[],
      tags: parseJsonArray(row.tags),
      draft: row.status ? row.status !== "published" : false,
      autodescription: true,
    },
    body: rawBody,
    htmlBody,
    headings: extractHeadings(htmlBody),
    slug: row.slug,
  };
}

export async function getD1BlogEntries(
  api: ApiFetcher,
  siteSlug: string
): Promise<any[]> {
  const json = await apiFetch<any>(
    api,
    `/api/blog?site=${encodeURIComponent(siteSlug)}&limit=100`
  );
  const rows = json.data || [];
  return rows.map(formatD1Entry);
}

export async function getD1BlogEntry(
  api: ApiFetcher,
  siteSlug: string,
  slug: string
): Promise<any | null> {
  try {
    const json = await apiFetch<any>(
      api,
      `/api/blog/${encodeURIComponent(slug)}?site=${encodeURIComponent(siteSlug)}`
    );
    if (!json.data) return null;
    return formatD1Entry(json.data);
  } catch {
    return null;
  }
}
