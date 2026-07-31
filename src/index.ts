// SoakAtlas MCP Server — Cloudflare Worker
// Exposes 5 regional hot springs databases via MCP Streamable HTTP transport
// Zero runtime dependencies — JSON-RPC 2.0 implemented directly

export interface Env {
  DB_DESERT: D1Database;
  DB_ROCKIES: D1Database;
  DB_COLORADO: D1Database;
  DB_SHASTA: D1Database;
  DB_WASHINGTON: D1Database;
  DB_ALASKA: D1Database;
  BLOG_QUEUE: KVNamespace;
  MINIMAX_API_KEY: string;
  WOLLY_CMS_API: string;
  WOLLYCMS?: any;
}

interface DBRegion {
  region: string;
  db: D1Database;
}

interface SpringRow {
  name: string;
  slug: string;
  lat: number;
  lon: number;
  elevation_ft: number | null;
  temperature_f: number | null;
  access_type: string;
  development: string;
  state: string;
  region: string;
  description: string | null;
  fees: string | null;
  fee_amount_usd: number | null;
  clothing_policy: string | null;
  dog_policy: string | null;
  ada_accessible: number | null;
  cell_service: string | null;
  seasonal_open: string | null;
  seasonal_close: string | null;
  seasonal_notes: string | null;
  nearby_town: string | null;
  distance_to_town_mi: number | null;
  pool_count: number | null;
  water_flow: string | null;
  fs_road: string | null;
  trailhead_lat: number | null;
  trailhead_lon: number | null;
  reservation_required: number | null;
  reservation_url: string | null;
  image_url: string | null;
  vehicle_requirement: string | null;
  permit_types: string | null;
  crowding_pattern: string | null;
  ferry_dependent: number | null;
  ferry_route: string | null;
  winter_access_notes: string | null;
  nwac_zone: string | null;
}

function getDatabases(env: Env): DBRegion[] {
  const dbs: DBRegion[] = [];
  if (env.DB_DESERT) dbs.push({ region: 'desert', db: env.DB_DESERT });
  if (env.DB_ROCKIES) dbs.push({ region: 'rockies', db: env.DB_ROCKIES });
  if (env.DB_COLORADO) dbs.push({ region: 'colorado', db: env.DB_COLORADO });
  if (env.DB_SHASTA) dbs.push({ region: 'shasta', db: env.DB_SHASTA });
  if (env.DB_WASHINGTON) dbs.push({ region: 'washington', db: env.DB_WASHINGTON });
  if (env.DB_ALASKA) dbs.push({ region: 'alaska', db: env.DB_ALASKA });
  return dbs;
}

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatSpring(s: SpringRow, distance?: number): string {
  const lines: string[] = [];
  lines.push(`**${s.name}**`);
  lines.push(`Location: ${s.lat}, ${s.lon} | ${s.state.toUpperCase()} | ${s.elevation_ft ?? '?'} ft elevation`);
  lines.push(`Temperature: ${s.temperature_f ?? '?'}°F | Access: ${s.access_type} | Development: ${s.development}`);
  if (distance !== undefined) lines.push(`Distance: ${distance.toFixed(1)} miles from search point`);
  if (s.nearby_town) lines.push(`Nearest town: ${s.nearby_town}${s.distance_to_town_mi ? ` (${s.distance_to_town_mi} mi)` : ''}`);
  if (s.pool_count) lines.push(`Pools: ${s.pool_count}`);
  if (s.description) lines.push(`About: ${s.description}`);
  if (s.dog_policy && s.dog_policy !== 'unknown') lines.push(`Dogs: ${s.dog_policy}`);
  if (s.clothing_policy && s.clothing_policy !== 'unknown') lines.push(`Clothing: ${s.clothing_policy}`);
  if (s.ada_accessible) lines.push(`ADA accessible: Yes`);
  if (s.fees) lines.push(`Fees: ${s.fees}`);
  if (s.reservation_required) lines.push(`Reservations: Required${s.reservation_url ? ` — ${s.reservation_url}` : ''}`);
  if (s.seasonal_open) {
    const season = s.seasonal_close ? `${s.seasonal_open} – ${s.seasonal_close}` : s.seasonal_open;
    lines.push(`Season: ${season}`);
  }
  if (s.seasonal_notes) lines.push(`Seasonal notes: ${s.seasonal_notes}`);
  if (s.cell_service && s.cell_service !== 'unknown') lines.push(`Cell service: ${s.cell_service}`);
  if (s.water_flow && s.water_flow !== 'unknown') lines.push(`Water flow: ${s.water_flow}`);
  if (s.fs_road) lines.push(`Forest Service Road: ${s.fs_road}`);
  if (s.trailhead_lat && s.trailhead_lon) lines.push(`Trailhead: ${s.trailhead_lat}, ${s.trailhead_lon}`);
  if (s.vehicle_requirement && s.vehicle_requirement !== 'any') lines.push(`Vehicle: ${s.vehicle_requirement}`);
  if (s.crowding_pattern && s.crowding_pattern !== 'unknown') lines.push(`Crowding: ${s.crowding_pattern}`);
  if (s.ferry_dependent) lines.push(`Ferry required: Yes${s.ferry_route ? ` — ${s.ferry_route}` : ''}`);
  if (s.winter_access_notes) lines.push(`Winter access: ${s.winter_access_notes}`);
  if (s.nwac_zone) lines.push(`NWAC avalanche zone: ${s.nwac_zone}`);
  lines.push(`Slug: ${s.slug}`);
  return lines.join('\n');
}

const BASE_COLS = `name, slug, lat, lon, elevation_ft, temperature_f, access_type, development, state, region, description, fees, fee_amount_usd, clothing_policy, dog_policy, ada_accessible, cell_service, seasonal_open, seasonal_close, seasonal_notes, nearby_town, distance_to_town_mi, pool_count, water_flow, fs_road, trailhead_lat, trailhead_lon, reservation_required, reservation_url, image_url, vehicle_requirement, permit_types, crowding_pattern, ferry_dependent, ferry_route, winter_access_notes, nwac_zone`;

// ---- Tool Handlers ----

async function findNearLocation(args: any, env: Env): Promise<string> {
  const lat = args.lat;
  const lon = args.lon;
  const radiusMiles = Math.min(args.radius_miles || 50, 200);
  const limit = Math.min(args.limit || 10, 25);

  const latDelta = radiusMiles / 69.0;
  const lonDelta = radiusMiles / (69.0 * Math.cos(lat * Math.PI / 180));

  const dbs = getDatabases(env);
  const whereClauses: string[] = [
    `lat BETWEEN ? AND ?`,
    `lon BETWEEN ? AND ?`,
  ];
  const params: any[] = [lat - latDelta, lat + latDelta, lon - lonDelta, lon + lonDelta];

  if (args.access_type) { whereClauses.push('access_type = ?'); params.push(args.access_type); }
  if (args.development) { whereClauses.push('development = ?'); params.push(args.development); }
  if (args.min_temp_f) { whereClauses.push('temperature_f >= ?'); params.push(args.min_temp_f); }
  if (args.max_temp_f) { whereClauses.push('temperature_f <= ?'); params.push(args.max_temp_f); }

  const where = whereClauses.join(' AND ');
  const sql = `SELECT ${BASE_COLS} FROM springs WHERE ${where}`;

  const results = await Promise.all(dbs.map(async ({ db }) => {
    const r = await db.prepare(sql).bind(...params).all();
    return (r.results as SpringRow[]).map(s => ({ spring: s, distance: distanceMiles(lat, lon, s.lat, s.lon) }));
  }));

  const all = results.flat().filter(r => r.distance <= radiusMiles);
  all.sort((a, b) => a.distance - b.distance);
  const top = all.slice(0, limit);

  if (top.length === 0) return 'No hot springs found within the specified radius and filters.';
  return top.map(r => formatSpring(r.spring, r.distance)).join('\n\n---\n\n');
}

async function findWithinBounds(args: any, env: Env): Promise<string> {
  const limit = Math.min(args.limit || 25, 50);
  const sql = `SELECT ${BASE_COLS} FROM springs WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT ?`;
  const params = [args.sw_lat, args.ne_lat, args.sw_lon, args.ne_lon, limit];

  const dbs = getDatabases(env);
  const results = await Promise.all(dbs.map(async ({ db }) => {
    const r = await db.prepare(sql).bind(...params).all();
    return r.results as SpringRow[];
  }));

  const all = results.flat().sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  if (all.length === 0) return 'No hot springs found within the specified bounds.';
  return all.map(s => formatSpring(s)).join('\n\n---\n\n');
}

async function searchHotSprings(args: any, env: Env): Promise<string> {
  const limit = Math.min(args.limit || 15, 30);
  const dbs = getDatabases(env);

  // If region specified, only query that DB
  let targetDbs = dbs;
  if (args.region) {
    targetDbs = dbs.filter(d => d.region === args.region);
    if (targetDbs.length === 0) return `No database found for region '${args.region}'. Available: ${dbs.map(d => d.region).join(', ')}`;
  }

  const whereClauses: string[] = [];
  const params: any[] = [];

  if (args.query) { whereClauses.push('name LIKE ?'); params.push(`%${args.query}%`); }
  if (args.state) { whereClauses.push('state = ?'); params.push(args.state.toLowerCase()); }
  if (args.access_type) { whereClauses.push('access_type = ?'); params.push(args.access_type); }
  if (args.development) { whereClauses.push('development = ?'); params.push(args.development); }
  if (args.min_temp_f) { whereClauses.push('temperature_f >= ?'); params.push(args.min_temp_f); }
  if (args.max_temp_f) { whereClauses.push('temperature_f <= ?'); params.push(args.max_temp_f); }
  if (args.min_elevation_ft) { whereClauses.push('elevation_ft >= ?'); params.push(args.min_elevation_ft); }
  if (args.dog_friendly) { whereClauses.push("dog_policy IN ('allowed', 'leash_required')"); }
  if (args.ada_accessible) { whereClauses.push('ada_accessible = 1'); }
  if (args.free_only) { whereClauses.push('(fees IS NULL OR fee_amount_usd = 0)'); }
  if (args.vehicle_requirement) { whereClauses.push('vehicle_requirement = ?'); params.push(args.vehicle_requirement); }
  if (args.crowding_pattern) { whereClauses.push('crowding_pattern = ?'); params.push(args.crowding_pattern); }
  if (args.ferry_dependent === true) { whereClauses.push('ferry_dependent = 1'); }
  else if (args.ferry_dependent === false) { whereClauses.push('(ferry_dependent = 0 OR ferry_dependent IS NULL)'); }

  const where = whereClauses.length > 0 ? whereClauses.join(' AND ') : '1=1';
  const sql = `SELECT ${BASE_COLS} FROM springs WHERE ${where} LIMIT ?`;
  params.push(limit);

  const results = await Promise.all(targetDbs.map(async ({ db }) => {
    const r = await db.prepare(sql).bind(...params).all();
    return r.results as SpringRow[];
  }));

  const all = results.flat().slice(0, limit);
  if (all.length === 0) return 'No hot springs found matching the specified filters.';
  return all.map(s => formatSpring(s)).join('\n\n---\n\n');
}

async function getHotSpringDetails(args: any, env: Env): Promise<string> {
  const dbs = getDatabases(env);
  const sql = `SELECT ${BASE_COLS} FROM springs WHERE slug = ?`;

  for (const { db } of dbs) {
    const r = await db.prepare(sql).bind(args.slug).first();
    if (r) return formatSpring(r as SpringRow);
  }
  return `Hot spring '${args.slug}' not found.`;
}

async function getHotSpringsByRegion(args: any, env: Env): Promise<string> {
  const limit = Math.min(args.limit || 25, 50);
  const dbs = getDatabases(env);
  const target = dbs.find(d => d.region === args.region);

  if (!target) return `No database found for region '${args.region}'. Available: ${dbs.map(d => d.region).join(', ')}`;

  const r = await target.db.prepare(`SELECT ${BASE_COLS} FROM springs WHERE region = ? LIMIT ?`).bind(args.region, limit).all();
  const springs = r.results as SpringRow[];

  if (springs.length === 0) return `No hot springs found in region '${args.region}'.`;
  return springs.map(s => formatSpring(s)).join('\n\n---\n\n');
}

// ---- MCP Protocol ----

const TOOLS = [
  {
    name: 'find_hotsprings_near_location',
    description: 'Find hot springs sorted by distance from a geographic point. Uses bounding box pre-filter then Haversine distance calculation for accuracy.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        lat: { type: 'number', description: 'Center latitude' },
        lon: { type: 'number', description: 'Center longitude' },
        radius_miles: { type: 'number', description: 'Search radius in miles (default 50, max 200)' },
        limit: { type: 'number', description: 'Max results (default 10, max 25)' },
        access_type: { type: 'string', enum: ['paved', 'dirt', 'hike', '4wd', 'resort', 'boat', 'drive-up'], description: 'Filter by road access type' },
        development: { type: 'string', enum: ['primitive', 'developed', 'resort'], description: 'Filter by development level' },
        min_temp_f: { type: 'number', description: 'Minimum soaking temperature in Fahrenheit' },
        max_temp_f: { type: 'number', description: 'Maximum soaking temperature in Fahrenheit' },
      },
      required: ['lat', 'lon'],
    },
  },
  {
    name: 'find_hotsprings_within_bounds',
    description: 'Find hot springs within a geographic bounding box (for map viewport queries).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sw_lat: { type: 'number', description: 'Southwest corner latitude' },
        sw_lon: { type: 'number', description: 'Southwest corner longitude' },
        ne_lat: { type: 'number', description: 'Northeast corner latitude' },
        ne_lon: { type: 'number', description: 'Northeast corner longitude' },
        limit: { type: 'number', description: 'Max results (default 25, max 50)' },
      },
      required: ['sw_lat', 'sw_lon', 'ne_lat', 'ne_lon'],
    },
  },
  {
    name: 'search_hotsprings',
    description: 'Search and filter hot springs by characteristics. The primary discovery tool for natural-language queries about hot springs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Partial name match' },
        state: { type: 'string', description: '2-letter state code (ak, az, ca, co, id, mt, nv, or, ut, wa, wy)' },
        region: { type: 'string', enum: ['desert', 'rockies', 'colorado', 'shasta', 'washington', 'alaska'], description: 'Regional database to query' },
        access_type: { type: 'string', enum: ['paved', 'dirt', 'hike', '4wd', 'resort', 'boat', 'drive-up'], description: 'Road access type' },
        development: { type: 'string', enum: ['primitive', 'developed', 'resort'], description: 'Development level' },
        min_temp_f: { type: 'number', description: 'Min temperature Fahrenheit' },
        max_temp_f: { type: 'number', description: 'Max temperature Fahrenheit' },
        min_elevation_ft: { type: 'number', description: 'Min elevation in feet' },
        dog_friendly: { type: 'boolean', description: 'Dog-friendly springs only' },
        ada_accessible: { type: 'boolean', description: 'ADA accessible only' },
        free_only: { type: 'boolean', description: 'Free springs only' },
        vehicle_requirement: { type: 'string', enum: ['any', 'high_clearance', 'awd_4wd', 'not_winter_accessible'], description: 'Vehicle access requirement' },
        ferry_dependent: { type: 'boolean', description: 'Filter by ferry dependency (true = ferry required, false = no ferry)' },
        crowding_pattern: { type: 'string', enum: ['weekday_quiet', 'weekend_busy', 'seasonal_variable', 'unknown'], description: 'Crowding pattern filter' },
        limit: { type: 'number', description: 'Max results (default 15, max 30)' },
      },
    },
  },
  {
    name: 'get_hotspring_details',
    description: 'Get full details for a specific hot spring by its slug identifier.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        slug: { type: 'string', description: "The spring's URL slug, e.g. 'strawberry-hot-springs-colorado'" },
      },
      required: ['slug'],
    },
  },
  {
    name: 'get_hotsprings_by_region',
    description: 'Get all hot springs in a specific region. Returns a directory listing for a regional site.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        region: { type: 'string', enum: ['desert', 'rockies', 'colorado', 'shasta', 'washington', 'alaska'], description: 'Region to list' },
        limit: { type: 'number', description: 'Max results (default 25, max 50)' },
      },
      required: ['region'],
    },
  },
];

// ─── Trail geometry fetch for poster rendering ───────────────────────────────

async function handleTrailsRequest(slug: string, env: Env): Promise<Response> {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  // Look up spring
  const dbs = getDatabases(env);
  let spring: { lat: number; lon: number; access_type: string; trailhead_lat: number | null; trailhead_lon: number | null } | null = null;
  for (const { db } of dbs) {
    const row = await db
      .prepare('SELECT lat, lon, access_type, trailhead_lat, trailhead_lon FROM springs WHERE slug = ? LIMIT 1')
      .bind(slug)
      .first();
    if (row) { spring = row as any; break; }
  }
  if (!spring) {
    return Response.json({ error: 'Spring not found' }, { status: 404, headers: corsHeaders });
  }

  const zoom = spring.access_type === 'hike' ? 13 : (spring.access_type === 'dirt' || spring.access_type === '4wd' ? 12 : 11);

  // Check KV cache
  const cacheKey = `trails:${slug}`;
  const cached = await env.BLOG_QUEUE.get(cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    return Response.json({ ...data, zoom, trailhead: spring.trailhead_lat ? { lat: spring.trailhead_lat, lng: spring.trailhead_lon } : null }, { headers: corsHeaders });
  }

  // Query Overpass API for hiking paths within 2km
  const overpassQuery = `[out:json][timeout:15];(way["highway"~"path|footway|track"](around:2000,${spring.lat},${spring.lon}););out geom;`;
  let trails: any[] = [];
  try {
    const opRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(overpassQuery),
    });
    if (opRes.ok) {
      const opData = await opRes.json() as any;
      trails = (opData.elements || [])
        .filter((el: any) => el.type === 'way' && el.geometry && el.geometry.length >= 2)
        .map((el: any) => ({
          type: 'Feature',
          properties: {
            name: el.tags?.name || null,
            highway: el.tags?.highway || 'path',
          },
          geometry: {
            type: 'LineString',
            coordinates: el.geometry.map((g: any) => [g.lon, g.lat]),
          },
        }));
    }
  } catch (e) {
    console.error('Overpass fetch failed:', e);
  }

  const result = { trails: { type: 'FeatureCollection', features: trails }, count: trails.length };

  // Cache for 30 days
  await env.BLOG_QUEUE.put(cacheKey, JSON.stringify(result), { expirationTtl: 30 * 24 * 60 * 60 });

  return Response.json(
    { ...result, zoom, trailhead: spring.trailhead_lat ? { lat: spring.trailhead_lat, lng: spring.trailhead_lon } : null },
    { headers: corsHeaders },
  );
}

function jsonResponse(id: any, result: any) {
  return Response.json({ jsonrpc: '2.0', id, result });
}

function errorResponse(id: any, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleToolCall(name: string, args: any, env: Env): Promise<string> {
  switch (name) {
    case 'find_hotsprings_near_location': return findNearLocation(args, env);
    case 'find_hotsprings_within_bounds': return findWithinBounds(args, env);
    case 'search_hotsprings': return searchHotSprings(args, env);
    case 'get_hotspring_details': return getHotSpringDetails(args, env);
    case 'get_hotsprings_by_region': return getHotSpringsByRegion(args, env);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id',
        },
      });
    }

    // Health check
    if (request.method === 'GET' && (new URL(request.url).pathname === '/' || new URL(request.url).pathname === '/health')) {
      return Response.json({ status: 'ok', server: 'soakatlas-mcp', springs: 500, regions: getDatabases(env).map(d => d.region) });
    }

    // REST endpoint: GET /springs — list/search springs (used by shop homepage)
    if (request.method === 'GET' && new URL(request.url).pathname === '/springs') {
      const url = new URL(request.url);
      const q = url.searchParams.get('q')?.trim() ?? '';
      const region = url.searchParams.get('region')?.trim() ?? '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);

      let targetDbs = getDatabases(env);
      if (region) {
        targetDbs = targetDbs.filter(d => d.region === region);
        if (targetDbs.length === 0) {
          return Response.json({ error: `Unknown region: ${region}` }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
        }
      }

      const whereClauses: string[] = [];
      const params: any[] = [];
      if (q) { whereClauses.push('name LIKE ?'); params.push(`%${q}%`); }

      const where = whereClauses.length > 0 ? whereClauses.join(' AND ') : '1=1';
      const sql = `SELECT name, slug, lat, lon, state, region FROM springs WHERE ${where} ORDER BY name LIMIT ?`;
      params.push(limit);

      const results = await Promise.all(targetDbs.map(async ({ db, region: r }) => {
        const res = await db.prepare(sql).bind(...params).all();
        return (res.results as SpringRow[]).map(s => ({
          name: s.name, slug: s.slug, lat: s.lat, lng: s.lon, state: s.state, region: r,
        }));
      }));

      const all = results.flat().sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
      return Response.json({ springs: all, count: all.length }, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // REST endpoint: GET /spring/:slug — used by the shop's PosterStudio
    if (request.method === 'GET' && new URL(request.url).pathname.startsWith('/spring/')) {
      const parts = new URL(request.url).pathname.replace('/spring/', '').trim();
      // Check for /trails sub-path
      if (parts.endsWith('/trails')) {
        return handleTrailsRequest(parts.replace('/trails', ''), env);
      }
      const slug = parts;
      if (!slug) return Response.json({ error: 'Missing slug' }, { status: 400 });
      const dbs = getDatabases(env);
      let found: SpringRow | null = null;
      for (const { db } of dbs) {
        const row = await db
          .prepare('SELECT name, slug, lat, lon, state, access_type, trailhead_lat, trailhead_lon FROM springs WHERE slug = ? LIMIT 1')
          .bind(slug)
          .first<SpringRow>();
        if (row) { found = row; break; }
      }
      if (!found) return Response.json({ error: 'Spring not found' }, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
      const zoom = found.access_type === 'hike' ? 13 : (found.access_type === 'dirt' || found.access_type === '4wd' ? 12 : 11);
      return Response.json(
        {
          name: found.name, slug: found.slug, lat: found.lat, lng: found.lon,
          state: found.state, access_type: found.access_type,
          trailhead_lat: found.trailhead_lat, trailhead_lon: found.trailhead_lon,
          zoom,
        },
        { headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // MCP endpoint: POST /mcp
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id',
    };

    try {
      const body = await request.json();

      // Batch support
      const requests = Array.isArray(body) ? body : [body];
      const responses = await Promise.all(requests.map(async (req: any) => {
        const { id, method, params } = req;

        switch (method) {
          case 'initialize':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2024-11-05',
                serverInfo: { name: 'soakatlas', version: '1.0.0' },
                capabilities: { tools: {} },
              },
            };

          case 'notifications/initialized':
            return null; // HTTP 202, no body

          case 'tools/list':
            return {
              jsonrpc: '2.0',
              id,
              result: { tools: TOOLS },
            };

          case 'tools/call': {
            const toolName = params?.name;
            const toolArgs = params?.arguments || {};
            try {
              const text = await handleToolCall(toolName, toolArgs, env);
              return {
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{ type: 'text', text }],
                },
              };
            } catch (err: any) {
              return {
                jsonrpc: '2.0',
                id,
                error: { code: -32000, message: err.message },
              };
            }
          }

          default:
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Method not found: ${method}` },
            };
        }
      }));

      // Filter nulls (notifications/initialized)
      const filtered = responses.filter(r => r !== null);

      // Return single or batch
      const resultBody = Array.isArray(body) ? filtered : filtered[0];
      return new Response(JSON.stringify(resultBody), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    } catch (err: any) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },

  // ---- Scheduled Blog Publishing ----
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const SITE_SLUG = 'soaktrail';
    const WOLLY_API_URL = 'https://wollycms.buzzuw2.workers.dev/api';

    interface BlogTopic {
      slug: string;
      title: string;
      excerpt: string;
      keyword: string;
      structure: string[];
      tags: string[];
      featured_springs: string[];
      settings?: { author?: string; tone?: string };
      _meta: {
        phase: string;
        priority: string;
        pillar: boolean;
        published?: boolean;
        published_at?: string;
      };
    }

    function parseBlogOutput(raw: string) {
      let title = '';
      let excerpt = '';
      let body = raw;
      const titleMatch = raw.match(/^TITLE:\s*(.+?)\s*$/m);
      if (titleMatch) title = titleMatch[1].trim();
      const excerptMatch = raw.match(/^EXCERPT:\s*(.+?)\s*$/m);
      if (excerptMatch) excerpt = excerptMatch[1].trim();
      const bodyIdx = raw.indexOf('BODY:');
      if (bodyIdx >= 0) body = raw.substring(bodyIdx + 5).trim();
      body = body.replace(/^(TITLE:|EXCERPT:|IMAGE_PROMPT:|BODY:)\s*.*$/gm, '').trim();
      return { title, excerpt, body };
    }

    function markdownToTipTap(md: string): any {
      const content: any[] = [];
      const lines = md.split('\n');
      let i = 0;
      function parseInline(text: string): any[] {
        const nodes: any[] = [];
        let remaining = text;
        while (remaining.length > 0) {
          let m = remaining.match(/^\*\*(.+?)\*\*/);
          if (m) { nodes.push({ type: 'text', marks: [{ type: 'bold' }], text: m[1] }); remaining = remaining.substring(m[0].length); continue; }
          m = remaining.match(/^\*(.+?)\*/);
          if (m) { nodes.push({ type: 'text', marks: [{ type: 'italic' }], text: m[1] }); remaining = remaining.substring(m[0].length); continue; }
          m = remaining.match(/^[^*]+/);
          if (m) { nodes.push({ type: 'text', text: m[0] }); remaining = remaining.substring(m[0].length); continue; }
          nodes.push({ type: 'text', text: remaining[0] }); remaining = remaining.substring(1);
        }
        return nodes.length > 0 ? nodes : [{ type: 'text', text: '' }];
      }
      while (i < lines.length) {
        const line = lines[i].trim();
        if (line === '') { i++; continue; }
        if (line.startsWith('## ')) {
          content.push({ type: 'heading', attrs: { level: 2 }, content: parseInline(line.replace(/^##+ /, '')) });
          i++; continue;
        }
        if (line.startsWith('### ')) {
          content.push({ type: 'heading', attrs: { level: 3 }, content: parseInline(line.replace(/^###+ /, '')) });
          i++; continue;
        }
        const paraLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].trim().startsWith('## ') && !lines[i].trim().startsWith('### ')) {
          paraLines.push(lines[i].trim()); i++;
        }
        if (paraLines.length > 0) content.push({ type: 'paragraph', content: parseInline(paraLines.join(' ')) });
      }
      return { type: 'doc', content };
    }

    async function generateWithMinimax(topic: BlogTopic, queueSettings: any): Promise<string> {
      if (!env.MINIMAX_API_KEY) throw new Error('MINIMAX_API_KEY not set');
      const tone = queueSettings?.tone || 'friendly, knowledgeable, adventurous';
      const author = queueSettings?.author || 'Soak Trail Team';
      const systemPrompt = `You are a professional travel writer for 'Soak Trail', a hot springs guide for the American West. Write in a ${tone} tone. Use ## for sections, no H1 tags. 800-1500 words. No bullet lists. BLUF style — key info first.`;
      const userPrompt = `Write a blog post based on this framework:\n\nKEYWORD: ${topic.keyword}\nAUTHOR: ${author}\n\nSTRUCTURE:\n${topic.structure.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nOUTPUT FORMAT:\nTITLE: [SEO title containing keyword]\nEXCERPT: [2-sentence meta description]\nIMAGE_PROMPT: [3-4 photo search keywords]\nBODY:\n[Article content]`;
      const response = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.MINIMAX_API_KEY}` },
        body: JSON.stringify({ model: 'MiniMax-M2.7', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.7 }),
      });
      if (!response.ok) throw new Error(`Minimax API error: ${response.status}`);
      const data = await response.json() as any;
      if (data.base_resp?.status_code !== 0) throw new Error(`Minimax error: ${data.base_resp?.status_msg}`);
      return data.choices?.[0]?.message?.content || '';
    }

    async function publishToWollyCMS(post: { slug: string; title: string; excerpt: string; body: string; tags: string[] }): Promise<void> {
      if (!env.WOLLY_CMS_API) throw new Error('WOLLY_CMS_API not set');
      const wollyFetch = env.WOLLYCMS
        ? (url: string, init?: RequestInit) => env.WOLLYCMS.fetch(url, init)
        : fetch;

      // Check for existing post
      const listRes = await wollyFetch(`${WOLLY_API_URL}/content/pages?type=blog&limit=100`, {
        headers: { Authorization: `Bearer ${env.WOLLY_CMS_API}` },
      });
      const listData = await listRes.json() as any;
      const existing = listData?.data?.find((p: any) => p.slug === post.slug);
      const method = existing ? 'PUT' : 'POST';
      const url = existing ? `${WOLLY_API_URL}/admin/pages/${existing.id}` : `${WOLLY_API_URL}/admin/pages`;

      const res = await wollyFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.WOLLY_CMS_API}` },
        body: JSON.stringify({
          title: post.title,
          slug: post.slug,
          typeId: 2,
          type: 'blog',
          status: 'published',
          published_at: new Date().toISOString(),
          fields: { excerpt: post.excerpt, body: post.body, site: SITE_SLUG },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`WollyCMS ${method} failed for ${post.slug}: ${err}`);
      }
    }

    try {
      console.log('🗓️ Running soaktrail blog scheduler...');

      const data = await env.BLOG_QUEUE.get('content-queue');
      if (!data) { console.log('Blog queue empty in KV'); return; }

      const queue: { topics: BlogTopic[]; settings?: any } = JSON.parse(data);
      const topicIdx = queue.topics.findIndex(t => !t._meta.published);
      if (topicIdx < 0) { console.log('All soaktrail topics published'); return; }

      const topic = queue.topics[topicIdx];
      console.log(`📝 Generating: ${topic.title}`);

      const rawOutput = await generateWithMinimax(topic, queue.settings);
      const parsed = parseBlogOutput(rawOutput);
      const postTitle = parsed.title || topic.title;
      const postExcerpt = parsed.excerpt || topic.excerpt;

      await publishToWollyCMS({ slug: topic.slug, title: postTitle, excerpt: postExcerpt, body: parsed.body, tags: topic.tags });
      console.log(`📋 Published to WollyCMS: ${topic.slug}`);

      // Mark as published and save back to KV
      queue.topics[topicIdx]._meta.published = true;
      queue.topics[topicIdx]._meta.published_at = new Date().toISOString();
      await env.BLOG_QUEUE.put('content-queue', JSON.stringify(queue));

      console.log(`✨ Done: ${postTitle}`);
    } catch (error: any) {
      console.error('Blog publishing failed:', error.message);
    }
  },
};
