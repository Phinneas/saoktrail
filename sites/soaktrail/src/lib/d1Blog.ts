import { marked } from 'marked';

const API_URL =
  (import.meta as any).env?.BLOG_API_URL ||
  'https://soaktherockies-api.buzzuw2.workers.dev';

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  tags: string[];
  featured_springs: string[];
  published_at: string;
  author: string;
  updated_at: string;
  image_url: string | null;
  site: string;
  status: string;
}

function parseJsonArray(v: any): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function getBlogPosts(siteSlug: string): Promise<BlogPost[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/blog?site=${encodeURIComponent(siteSlug)}&limit=100`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const rows = json.data || [];
    return rows.map((row: any) => ({
      ...row,
      tags: parseJsonArray(row.tags),
      featured_springs: parseJsonArray(row.featured_springs),
    }));
  } catch {
    return [];
  }
}

export async function getBlogPost(
  slug: string,
  siteSlug: string
): Promise<BlogPost | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/blog/${encodeURIComponent(slug)}?site=${encodeURIComponent(siteSlug)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data) return null;
    const row = json.data;
    return {
      ...row,
      tags: parseJsonArray(row.tags),
      featured_springs: parseJsonArray(row.featured_springs),
    };
  } catch {
    return null;
  }
}

export function renderBody(body: string): string {
  return marked.parse(body) as string;
}
