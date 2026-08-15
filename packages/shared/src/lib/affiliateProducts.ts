/**
 * affiliateProducts.ts — Product catalog + context-aware selection for the
 * AffiliateModal component.
 *
 * To add real affiliate products, add entries to the PRODUCTS array below.
 * Each product needs a key, name, description, category, and a URL (your
 * actual affiliate link from Amazon, Impact, REI, or wherever).
 *
 * The modal stays hidden when the catalog is empty — no products, no modal.
 * Add even one product and the modal starts working immediately.
 *
 * Pure TypeScript, no Astro imports — testable with node.
 */

export interface AffiliateProduct {
  key: string;
  name: string;
  description: string;
  category: 'clothing' | 'gear' | 'safety' | 'comfort' | 'electronics';
  /** Full affiliate URL from your partner program (Amazon, Impact, REI, etc.) */
  url: string;
  contextTags?: string[];
}

export const DISCLOSURE =
  'We may earn a commission from qualifying purchases through links on this page.';

/**
 * PRODUCT CATALOG
 *
 * Replace these with your real affiliate products. Example entry:
 * {
 *   key: 'example',
 *   name: 'Product Name',
 *   description: 'Short description of why it's useful for hot springs.',
 *   category: 'gear',
 *   url: 'https://www.amazon.com/dp/ASINHERE?tag=your-tag',
 *   contextTags: ['winter', 'desert', 'hydration'],
 * }
 *
 * contextTags are optional — used to bias which products show on which pages.
 * Common tags: winter, cold, desert, sun, altitude, hiking, camping,
 *              hydration, navigation, lodging, remote, general
 */
export const PRODUCTS: AffiliateProduct[] = [
  // Empty — add your real affiliate products here.
  // The modal will not appear until at least one product is added.
];

/* --------------------------- Utilities ---------------------------- */

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Get products, shuffled with context-aware weighting.
 *
 * Products whose contextTags match the provided hints get 3x weight.
 * Returns empty array if catalog is empty (modal stays hidden).
 *
 * @param count   How many products to return (default 4)
 * @param hints   Context tags from the page (e.g. ['winter', 'camping'])
 * @returns       Shuffled, sliced array of AffiliateProduct[]
 */
export function getRandomProducts(
  count: number = 4,
  hints: string[] = []
): AffiliateProduct[] {
  if (PRODUCTS.length === 0) return [];

  const hintSet = new Set(hints.map((h) => h.toLowerCase()));

  // Build weighted pool: matching products appear 3x, others 1x
  const pool: AffiliateProduct[] = [];
  for (const p of PRODUCTS) {
    const matches = (p.contextTags || []).some((t) => hintSet.has(t.toLowerCase()));
    const weight = matches ? 3 : 1;
    for (let i = 0; i < weight; i++) pool.push(p);
  }

  const shuffled = fisherYatesShuffle(pool);

  // Deduplicate by key (keep first occurrence after shuffle)
  const seen = new Set<string>();
  const unique: AffiliateProduct[] = [];
  for (const p of shuffled) {
    if (!seen.has(p.key)) {
      seen.add(p.key);
      unique.push(p);
    }
    if (unique.length >= count) break;
  }

  return unique;
}

/**
 * Extract context hints from a URL path and optional page attributes.
 *
 * @param pathname      window.location.pathname
 * @param pageAttrs     Optional data attributes from the page
 * @returns             Array of hint strings for product weighting
 */
export function getContextHints(
  pathname: string,
  pageAttrs?: Record<string, string>
): string[] {
  const hints: string[] = [];

  // From page data attributes (e.g. itinerary affiliate_categories)
  if (pageAttrs?.affiliateCategories) {
    hints.push(...pageAttrs.affiliateCategories.split(',').map((s) => s.trim()));
  }

  // From URL path
  if (pathname.startsWith('/minerals')) {
    hints.push('hydration', 'sun', 'altitude');
  } else if (pathname.startsWith('/trip-planner')) {
    hints.push('general', 'hydration');
  } else if (pathname.startsWith('/directory')) {
    hints.push('general', 'hiking');
  }

  // Scan page text for keyword hints (blog posts, etc.)
  if (typeof document !== 'undefined') {
    const bodyText = document.body?.innerText?.toLowerCase() || '';
    if (bodyText.includes('winter') || bodyText.includes('snow') || bodyText.includes('cold')) {
      hints.push('winter', 'cold');
    }
    if (bodyText.includes('desert') || bodyText.includes('arizona') || bodyText.includes('nevada')) {
      hints.push('desert', 'sun');
    }
    if (bodyText.includes('altitude') || bodyText.includes('elevation') || bodyText.includes('8,000')) {
      hints.push('altitude');
    }
    if (bodyText.includes('hike') || bodyText.includes('trail') || bodyText.includes('backcountry')) {
      hints.push('hiking', 'remote');
    }
    if (bodyText.includes('camp') || bodyText.includes('tent')) {
      hints.push('camping');
    }
  }

  return hints;
}
