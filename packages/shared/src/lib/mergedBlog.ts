// Merge local MDX blog entries (astro:content) with D1/API-served entries
// (from the soaktherockies-api Worker via a service binding). Dedup by slug —
// local MDX wins on collision so committed content is authoritative.
//
// Used by the three Asana-driven sites (desertsoak, soakcolorado, soaktherockies)
// so existing committed posts stay visible while new Asana-generated posts flow
// in at request time without a rebuild.

import { getCollection, getEntry, render } from "astro:content";
import { getD1BlogEntries, getD1BlogEntry, type ApiFetcher } from "./d1Blog";
import { sortByDate } from "./sortFunctions";
import { slugify } from "./textConverter";

export async function getMergedBlogEntries(
  api: ApiFetcher | undefined,
  siteSlug: string,
  sortFunction: (entries: any[]) => any[] = sortByDate
): Promise<any[]> {
  let local: any[] = [];
  try {
    const all = await getCollection("blog");
    local = all.filter(
      (e: any) => !String(e.id).startsWith("-") && !(e.data?.draft)
    );
  } catch {
    local = [];
  }

  let remote: any[] = [];
  try {
    remote = await getD1BlogEntries(api, siteSlug);
  } catch (e: any) {
    // D1/API is supplementary — never break the page if the API is unreachable.
    console.error(`D1 blog fetch failed for ${siteSlug}: ${e?.message || e}`);
    remote = [];
  }

  const seen = new Set<string>();
  const merged: any[] = [];
  for (const e of local) {
    const key = String(e.id);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(e);
    }
  }
  for (const e of remote) {
    const key = String(e.slug || e.id);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(e);
    }
  }
  return sortFunction(merged);
}

// Resolve a single entry by slug. Local MDX is rendered via astro:content (so
// shortcodes/components work); D1 entries fall back to pre-rendered HTML body.
// Returns { entry, Content, headings } — Content is null for D1 entries.
export async function getMergedBlogEntry(
  api: ApiFetcher | undefined,
  siteSlug: string,
  slug: string
): Promise<{ entry: any; Content: any; headings: any[] } | null> {
  try {
    const local = await getEntry("blog", slug);
    if (local && !(local as any).data?.draft) {
      const { Content, headings } = await render(local as any);
      return { entry: local, Content, headings: headings as any[] };
    }
  } catch {
    // not found locally — try D1
  }

  const remote = await getD1BlogEntry(api, siteSlug, slug);
  if (remote) {
    return { entry: remote, Content: null, headings: remote.headings || [] };
  }
  return null;
}

// Taxa computed from a merged entries array (getTaxa reads the local collection
// only, so it would miss D1 posts).
export function taxaFromEntries(entries: any[], name: string): string[] {
  const out: string[] = [];
  for (const e of entries) {
    for (const v of e.data?.[name] || []) out.push(slugify(String(v)));
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

export function taxaMultisetFromEntries(entries: any[], name: string): string[] {
  const out: string[] = [];
  for (const e of entries) {
    for (const v of e.data?.[name] || []) out.push(slugify(String(v)));
  }
  return out;
}
