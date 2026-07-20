export interface RegionMeta {
  slug: string;
  name: string;
  shortName: string;
  states: string;
  stateCodes: string[];
  childSite: string;
  childSiteName: string;
  description: string;
  image: string;
}

export const REGIONS: RegionMeta[] = [
  {
    slug: 'washington',
    name: 'Washington',
    shortName: 'WA',
    states: 'Washington State',
    stateCodes: ['wa'],
    childSite: 'https://www.washingtonhotsprings.com',
    childSiteName: 'Washington Hot Springs',
    description:
      "From moss-carpeted rainforest pools to Cascade mountain retreats, discover Washington's hidden thermal treasures.",
    image: '/washington-hotspring.jpg',
  },
  {
    slug: 'alaska',
    name: 'Alaska',
    shortName: 'AK',
    states: 'Alaska',
    stateCodes: ['ak'],
    childSite: 'https://www.alaskahotsprings.com',
    childSiteName: 'Alaska Hot Springs',
    description:
      "From remote wilderness pools to natural seaside soaks, discover Alaska's rugged geothermal treasures.",
    image: '/alaska-hotspring.jpg',
  },
  {
    slug: 'shasta',
    name: 'Shasta',
    shortName: 'CA+OR',
    states: 'Northern California & Southern Oregon',
    stateCodes: ['ca', 'or'],
    childSite: 'https://www.shastahotsprings.com',
    childSiteName: 'Shasta Hot Springs',
    description:
      'Sacred waters beneath Mount Shasta. Volcanic thermal pools and healing mineral springs in the Cascades.',
    image: '/shasta-hotspring.jpg',
  },
  {
    slug: 'colorado',
    name: 'Colorado + New Mexico',
    shortName: 'CO+NM',
    states: 'Colorado & New Mexico',
    stateCodes: ['co', 'nm'],
    childSite: 'https://www.soakcolorado.com',
    childSiteName: 'Soak Colorado',
    description:
      'Rocky Mountain mineral waters plus New Mexico desert oases. Over 30 developed resorts and countless primitive pools.',
    image: '/colorado-hotspring.jpg',
  },
  {
    slug: 'rockies',
    name: 'Northern Rockies',
    shortName: 'ID+MT+WY',
    states: 'Idaho, Montana & Wyoming',
    stateCodes: ['id', 'mt', 'wy'],
    childSite: 'https://www.soaktherockies.com',
    childSiteName: 'Soak the Rockies',
    description:
      "Natural thermal pools across the Northern Rockies' vast wilderness landscapes.",
    image: '/rockies-hotspring.jpg',
  },
  {
    slug: 'desert',
    name: 'Desert Southwest',
    shortName: 'UT+NV+AZ',
    states: 'Utah, Nevada & Arizona',
    stateCodes: ['ut', 'nv', 'az'],
    childSite: 'https://www.desertsoak.com',
    childSiteName: 'Desert Soak',
    description:
      'Steaming oases tucked between red rock canyons and sagebrush valleys across the Southwest.',
    image: '/desert-hotspring.jpg',
  },
];

export function getRegion(slug: string): RegionMeta | undefined {
  return REGIONS.find((r) => r.slug === slug);
}

export const MCP_URL =
  (import.meta.env?.PUBLIC_MCP_URL as string) ||
  'https://soakatlas-mcp.buzzuw2.workers.dev/mcp';
