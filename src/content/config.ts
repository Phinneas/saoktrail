import { defineCollection, z } from 'astro:content';

// SoakTrail Trip Planner — content collections
// Native Astro content collections (Zod frontmatter). No CMS dependency.
// When the parent merges into the monorepo, move these to packages/shared/src/types/.

const regionEnum = z.enum([
  'washington',
  'alaska',
  'shasta',
  'colorado',
  'rockies',
  'desert',
]);

const vehicleEnum = z.enum([
  'any',
  'high_clearance',
  'awd_4wd',
  'not_winter_accessible',
]);

const difficultyEnum = z.enum(['easy', 'moderate', 'strenuous', 'expert']);

const overnightEnum = z.enum(['none', 'camping', 'lodging', 'backpacking']);

// Itinerary: one MDX file per trip. Days are nested in frontmatter.
const itineraries = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    region: regionEnum,
    states: z.array(z.string()).default([]),
    duration_days: z.number().min(1),
    difficulty: difficultyEnum,
    total_distance: z.string().default(''),
    best_season: z.string().default(''),
    vehicle_requirement: vehicleEnum.default('any'),
    ferry_dependent: z.boolean().default(false),
    verification_status: z
      .enum(['verified', 'verify_before_departure', 'unverified'])
      .default('unverified'),
    image: z.string().optional(),
    packing_list: z.string().optional(),
    affiliate_categories: z.array(z.string()).default([]),
    days: z.array(
      z.object({
        day_number: z.number().min(1),
        title: z.string(),
        spring_slugs: z.array(z.string()).default([]),
        summary: z.string(),
        overnight_type: overnightEnum.default('none'),
        lodging_area: z.string().optional(),
        ferry_dependent: z.boolean().default(false),
        drive_distance: z.string().optional(),
      })
    ).default([]),
    draft: z.boolean().default(false),
  }),
});

// VerificationRecord: status sync for springs across child sites + parent.
// Auto-downgrade rule: status reverts to 'verify_before_departure' when expires_at passes.
const verificationRecords = defineCollection({
  type: 'data',
  schema: z.object({
    spring_slug: z.string(),
    source: z.enum([
      'official',
      'editorial',
      'community_report',
      'recent_visit',
    ]),
    status: z.enum([
      'open',
      'closed',
      'limited',
      'verify_before_departure',
      'unknown',
    ]),
    verified_at: z.coerce.date(),
    expires_at: z.coerce.date().optional(),
    source_url: z.string().url().optional(),
    notes: z.string().optional(),
    verified_by: z.string().optional(),
  }),
});

// OfficialResource: USFS, NPS, WSDOT, NWAC, permit portals, ferries.
const officialResources = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    type: z.enum([
      'usfs',
      'nps',
      'state_park',
      'wsdot',
      'nwac',
      'weather',
      'ferry',
      'permit',
      'other',
    ]),
    url: z.string().url(),
    states: z.array(z.string()).default([]),
    description: z.string().default(''),
  }),
});

// PackingList: seasonal gear lists with optional affiliate links per item.
const packingLists = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    season: z
      .enum(['summer', 'fall', 'winter', 'spring', 'all_season'])
      .default('all_season'),
    items: z.array(
      z.object({
        name: z.string(),
        category: z
          .enum(['clothing', 'gear', 'safety', 'comfort', 'electronics'])
          .default('gear'),
        essential: z.boolean().default(false),
        affiliate_slug: z.string().optional(),
      })
    ).default([]),
  }),
});

// AffiliateOffer: centralized offer library for disclosure + placement rules.
const affiliateOffers = defineCollection({
  type: 'data',
  schema: z.object({
    provider: z.string(),
    category: z.enum([
      'lodging',
      'camping',
      'navigation',
      'gear',
      'tours',
      'insurance',
    ]),
    program: z.string(),
    url: z.string().url(),
    cookie_days: z.number().optional(),
    commission: z.string().optional(),
    do_not_display_when: z.array(z.string()).default([]),
    disclosure_required: z.boolean().default(true),
  }),
});

export const collections = {
  itineraries,
  'verification-records': verificationRecords,
  'official-resources': officialResources,
  'packing-lists': packingLists,
  'affiliate-offers': affiliateOffers,
};
