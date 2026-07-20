import { getCollection, type CollectionEntry } from 'astro:content';

export type AffiliateCategory =
  | 'lodging'
  | 'camping'
  | 'navigation'
  | 'gear'
  | 'tours'
  | 'insurance';

export interface AffiliateOfferData {
  slug: string;
  provider: string;
  category: AffiliateCategory;
  program: string;
  url: string;
  cookie_days: number | null;
  commission: string | null;
  do_not_display_when: string[];
  disclosure_required: boolean;
}

export interface OfferContext {
  difficulty?: string;
  overnight_type?: string;
  vehicle_requirement?: string;
  has_lodging_area?: boolean;
}

/**
 * Fetch all affiliate offers for a given category.
 */
export async function getOffersByCategory(
  category: AffiliateCategory
): Promise<AffiliateOfferData[]> {
  let entries: CollectionEntry<'affiliate-offers'>[] = [];
  try {
    entries = await getCollection('affiliate-offers', (entry) => {
      const data = entry.data as Record<string, unknown>;
      return data.category === category;
    });
  } catch {
    return [];
  }

  return entries.map((entry) => {
    const d = entry.data as Record<string, unknown>;
    return {
      slug: entry.slug,
      provider: d.provider as string,
      category: d.category as AffiliateCategory,
      program: d.program as string,
      url: d.url as string,
      cookie_days: (d.cookie_days as number) ?? null,
      commission: (d.commission as string) ?? null,
      do_not_display_when: (d.do_not_display_when as string[]) ?? [],
      disclosure_required: (d.disclosure_required as boolean) ?? true,
    };
  });
}

/**
 * Check whether an offer should be displayed given the trip context.
 * Returns false if any do_not_display_when rule matches.
 */
export function shouldDisplayOffer(
  offer: AffiliateOfferData,
  ctx: OfferContext
): boolean {
  for (const rule of offer.do_not_display_when) {
    switch (rule) {
      case 'backcountry_only':
        if (ctx.overnight_type === 'backpacking') return false;
        break;
      case 'no_lodging_nearby':
        if (!ctx.has_lodging_area) return false;
        break;
      case 'lodging_only':
        if (ctx.overnight_type === 'lodging') return false;
        break;
      case 'no_camping_nearby':
        if (!ctx.has_lodging_area) return false;
        break;
      case 'urban_easy':
        if (ctx.difficulty === 'easy' && ctx.vehicle_requirement === 'any')
          return false;
        break;
      case 'paved_roads_only':
        if (ctx.vehicle_requirement === 'any') return false;
        break;
    }
  }
  return true;
}

/**
 * Build an offer URL by replacing {location}, {checkin}, {checkout} placeholders.
 */
export function buildOfferUrl(
  urlTemplate: string,
  params: { location?: string; checkin?: string; checkout?: string }
): string {
  let url = urlTemplate;
  if (params.location) {
    url = url.replace('{location}', encodeURIComponent(params.location));
  }
  if (params.checkin) {
    url = url.replace('{checkin}', params.checkin);
  }
  if (params.checkout) {
    url = url.replace('{checkout}', params.checkout);
  }
  return url;
}

/**
 * Fetch filtered offers for a given category and context.
 */
export async function getFilteredOffers(
  category: AffiliateCategory,
  ctx: OfferContext
): Promise<AffiliateOfferData[]> {
  const offers = await getOffersByCategory(category);
  return offers.filter((offer) => shouldDisplayOffer(offer, ctx));
}
