/**
 * SoakTrail Analytics — provider-agnostic tracking helpers.
 * Uses Plausible by default (privacy-friendly, no cookies, GDPR-exempt).
 * Falls back gracefully if Plausible is not configured.
 */

// Server-side: read Plausible domain from env
export function getPlausibleDomain(): string | undefined {
  return import.meta.env?.PUBLIC_PLAUSIBLE_DOMAIN as string | undefined;
}

// Client-side: fire a custom event via Plausible
export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>
): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { plausible?: (...args: unknown[]) => void };
  if (typeof w.plausible === 'function') {
    w.plausible(name, props ? { props } : undefined);
  }
}

// Client-side: track a search event from TripFinder
export function trackSearch(params: {
  region: string;
  resultCount: number;
  filters: Record<string, string | number | boolean>;
}): void {
  trackEvent('search', {
    region: params.region || 'all',
    result_count: params.resultCount,
    ...params.filters,
  });
}

// Client-side: track a spring card click from TripFinder
export function trackSpringClick(params: {
  slug: string;
  name: string;
  state: string;
}): void {
  trackEvent('spring_click', {
    slug: params.slug,
    name: params.name,
    state: params.state,
  });
}

// Client-side: track an affiliate link click
export function trackAffiliateClick(params: {
  provider: string;
  category: string;
  location?: string;
}): void {
  trackEvent('affiliate_click', {
    provider: params.provider,
    category: params.category,
    location: params.location || 'unknown',
  });
}
