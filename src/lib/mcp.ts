import { MCP_URL } from './regions';

export interface SpringResult {
  name: string;
  slug: string;
  lat: number;
  lon: number;
  state: string;
  elevation_ft: number | null;
  temperature_f: number | null;
  access_type: string;
  development: string;
  nearby_town: string | null;
  distance_to_town_mi: number | null;
  pool_count: number | null;
  description: string | null;
  dog_policy: string | null;
  clothing_policy: string | null;
  ada_accessible: boolean;
  fees: string | null;
  reservation_required: boolean;
  reservation_url: string | null;
  seasonal_open: string | null;
  seasonal_close: string | null;
  seasonal_notes: string | null;
  cell_service: string | null;
  water_flow: string | null;
  fs_road: string | null;
  vehicle_requirement: string | null;
  crowding_pattern: string | null;
  ferry_dependent: boolean;
  ferry_route: string | null;
  winter_access_notes: string | null;
  nwac_zone: string | null;
  distance: number | null;
}

export interface SearchArgs {
  query?: string;
  state?: string;
  region?: string;
  access_type?: string;
  development?: string;
  min_temp_f?: number;
  max_temp_f?: number;
  min_elevation_ft?: number;
  dog_friendly?: boolean;
  ada_accessible?: boolean;
  free_only?: boolean;
  vehicle_requirement?: string;
  ferry_dependent?: boolean;
  crowding_pattern?: string;
  limit?: number;
}

function parseLine(lines: string[], key: string): string | null {
  const line = lines.find((l) => l.startsWith(key + ':'));
  if (!line) return null;
  return line.substring(key.length + 1).trim();
}

function parseNum(val: string | null): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/[^\d.-]/g, ''));
  return isNaN(n) ? null : n;
}

export function parseSpringText(block: string): SpringResult | null {
  const lines = block.trim().split('\n');
  if (lines.length < 2) return null;

  const nameMatch = lines[0].match(/^\*\*(.+)\*\*$/);
  if (!nameMatch) return null;
  const name = nameMatch[1];

  const locLine = parseLine(lines, 'Location');
  const tempLine = parseLine(lines, 'Temperature');
  const slug = parseLine(lines, 'Slug');
  if (!slug) return null;

  let lat = 0,
    lon = 0,
    state = '',
    elevation_ft: number | null = null;
  if (locLine) {
    const locMatch = locLine.match(/^([\d.-]+),\s*([\d.-]+)\s*\|\s*(\w+)\s*\|\s*(\d+|’\?')\s*ft/);
    if (locMatch) {
      lat = parseFloat(locMatch[1]);
      lon = parseFloat(locMatch[2]);
      state = locMatch[3];
      if (locMatch[4] && locMatch[4] !== '?') elevation_ft = parseInt(locMatch[4]);
    }
  }

  let access_type = '';
  let development = '';
  let temperature_f: number | null = null;
  if (tempLine) {
    const tempMatch = tempLine.match(/(\d+|’\?)°F\s*\|\s*Access:\s*(\S+)\s*\|\s*Development:\s*(\S+)/);
    if (tempMatch) {
      if (tempMatch[1] && tempMatch[1] !== '?') temperature_f = parseInt(tempMatch[1]);
      access_type = tempMatch[2];
      development = tempMatch[3];
    }
  }

  const distLine = parseLine(lines, 'Distance');
  const distance = distLine ? parseNum(distLine.replace(/miles.*/, '')) : null;

  const townLine = parseLine(lines, 'Nearest town');
  let nearby_town: string | null = null;
  let distance_to_town_mi: number | null = null;
  if (townLine) {
    const townMatch = townLine.match(/^(.+?)(?:\s*\(([\d.]+)\s*mi\))?$/);
    if (townMatch) {
      nearby_town = townMatch[1].trim();
      if (townMatch[2]) distance_to_town_mi = parseFloat(townMatch[2]);
    }
  }

  const ferryLine = parseLine(lines, 'Ferry required');
  const ferry_dependent = ferryLine !== null;
  const ferry_route = ferryLine?.replace(/^Yes\s*—\s*/, '') || null;

  return {
    name,
    slug,
    lat,
    lon,
    state,
    elevation_ft,
    temperature_f,
    access_type,
    development,
    nearby_town,
    distance_to_town_mi,
    pool_count: parseNum(parseLine(lines, 'Pools')),
    description: parseLine(lines, 'About'),
    dog_policy: parseLine(lines, 'Dogs'),
    clothing_policy: parseLine(lines, 'Clothing'),
    ada_accessible: parseLine(lines, 'ADA accessible') === 'Yes',
    fees: parseLine(lines, 'Fees'),
    reservation_required: parseLine(lines, 'Reservations')?.startsWith('Required') || false,
    reservation_url: parseLine(lines, 'Reservations')?.replace(/^Required\s*—\s*/, '') || null,
    seasonal_open: parseLine(lines, 'Season')?.split('–')[0]?.trim() || null,
    seasonal_close: parseLine(lines, 'Season')?.split('–')[1]?.trim() || null,
    seasonal_notes: parseLine(lines, 'Seasonal notes'),
    cell_service: parseLine(lines, 'Cell service'),
    water_flow: parseLine(lines, 'Water flow'),
    fs_road: parseLine(lines, 'Forest Service Road'),
    vehicle_requirement: parseLine(lines, 'Vehicle'),
    crowding_pattern: parseLine(lines, 'Crowding'),
    ferry_dependent,
    ferry_route,
    winter_access_notes: parseLine(lines, 'Winter access'),
    nwac_zone: parseLine(lines, 'NWAC avalanche zone'),
    distance,
  };
}

export function parseSpringsText(text: string): SpringResult[] {
  if (!text || text.startsWith('No hot springs') || text.startsWith('No database')) {
    return [];
  }
  const blocks = text.split('\n\n---\n\n');
  return blocks
    .map(parseSpringText)
    .filter((s): s is SpringResult => s !== null);
}

export async function searchSprings(args: SearchArgs): Promise<SpringResult[]> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'search_hotsprings',
        arguments: args,
      },
    }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const text = data?.result?.content?.[0]?.text;
  if (!text) return [];

  return parseSpringsText(text);
}

export async function getSpringsByRegion(region: string): Promise<SpringResult[]> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_hotsprings_by_region',
        arguments: { region, limit: 50 },
      },
    }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const text = data?.result?.content?.[0]?.text;
  if (!text) return [];

  return parseSpringsText(text);
}
