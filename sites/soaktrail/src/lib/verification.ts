import { getCollection, type CollectionEntry } from 'astro:content';

export type VerificationStatus =
  | 'open'
  | 'closed'
  | 'limited'
  | 'verify_before_departure'
  | 'unknown';

export interface SpringVerification {
  spring_slug: string;
  status: VerificationStatus;
  source: string;
  verified_at: Date;
  expires_at: Date | null;
  source_url: string | null;
  notes: string | null;
  downgraded: boolean;
}

const STATUS_LABELS: Record<VerificationStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  limited: 'Limited Access',
  verify_before_departure: 'Verify Before Departure',
  unknown: 'Unknown',
};

const STATUS_COLORS: Record<VerificationStatus, string> = {
  open: '#2d7a3e',
  closed: '#c0392b',
  limited: '#e67e22',
  verify_before_departure: '#b8915f',
  unknown: '#95a5a6',
};

export function statusLabel(status: VerificationStatus): string {
  return STATUS_LABELS[status] || 'Unknown';
}

export function statusColor(status: VerificationStatus): string {
  return STATUS_COLORS[status] || STATUS_COLORS.unknown;
}

/**
 * Auto-downgrade rule: if expires_at exists and is in the past,
 * status reverts to 'verify_before_departure' regardless of stored status.
 */
export function applyAutoDowngrade(
  status: VerificationStatus,
  expiresAt: Date | null | undefined,
  now: Date = new Date()
): { status: VerificationStatus; downgraded: boolean } {
  if (expiresAt && expiresAt < now) {
    return { status: 'verify_before_departure', downgraded: true };
  }
  return { status, downgraded: false };
}

export async function getVerificationForSpring(
  slug: string
): Promise<SpringVerification | null> {
  let records: CollectionEntry<'verification-records'>[] = [];
  try {
    records = await getCollection('verification-records', (entry) => {
      // Handle both string slug matching and nested data
      const data = entry.data as Record<string, unknown>;
      return data.spring_slug === slug;
    });
  } catch {
    return null;
  }

  if (records.length === 0) return null;

  // Sort by verified_at descending (most recent first)
  records.sort((a, b) => {
    const aTime = new Date(a.data.verified_at as string).getTime();
    const bTime = new Date(b.data.verified_at as string).getTime();
    return bTime - aTime;
  });

  const latest = records[0].data as Record<string, unknown>;
  const verifiedAt = new Date(latest.verified_at as string);
  const expiresAt = latest.expires_at ? new Date(latest.expires_at as string) : null;
  const { status, downgraded } = applyAutoDowngrade(
    latest.status as VerificationStatus,
    expiresAt
  );

  return {
    spring_slug: slug,
    status,
    source: latest.source as string,
    verified_at: verifiedAt,
    expires_at: expiresAt,
    source_url: (latest.source_url as string) || null,
    notes: (latest.notes as string) || null,
    downgraded,
  };
}

export async function getVerificationForSlugs(
  slugs: string[]
): Promise<Map<string, SpringVerification | null>> {
  const map = new Map<string, SpringVerification | null>();
  await Promise.all(
    slugs.map(async (slug) => {
      map.set(slug, await getVerificationForSpring(slug));
    })
  );
  return map;
}

/**
 * Get all unique spring slugs from an itinerary's days array.
 */
export function getItinerarySpringSlugs(
  days: Array<{ spring_slugs?: string[] }>
): string[] {
  const slugs = new Set<string>();
  for (const day of days) {
    if (day.spring_slugs) {
      for (const slug of day.spring_slugs) {
        slugs.add(slug);
      }
    }
  }
  return [...slugs];
}
