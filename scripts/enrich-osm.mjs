#!/usr/bin/env node
/**
 * Shared OSM Overpass enrichment for SoakTrail springs.json
 *
 * Usage: node sites/<site>/scripts/enrich-osm.mjs
 *   --bounds "south,west,north,east"  (bounding box, required)
 *   --label "Colorado"                (region label for logs)
 *   --dry-run                         (don't write, just report)
 *
 * Enriches springs.json with:
 *   - OSM node ID, name, tags
 *   - Nearby access roads, parking, trails, buildings, amenities
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}
const hasFlag = (name) => args.includes(`--${name}`);

const boundsStr = getArg('bounds');
const label = getArg('label') || 'Region';
const dryRun = hasFlag('dry-run');
const springsPathArg = getArg('springs-path');

if (!boundsStr) {
  console.error('Usage: node enrich-osm.mjs --bounds "south,west,north,east" --springs-path path/to/springs.json [--label "Colorado"]');
  process.exit(1);
}

const SPRINGS_PATH = springsPathArg
  ? resolve(springsPathArg)
  : resolve(__dirname, '../public/springs.json');

const [south, west, north, east] = boundsStr.split(',').map(Number);
if ([south, west, north, east].some(isNaN)) {
  console.error('Invalid bounds. Expected: "south,west,north,east"');
  process.exit(1);
}

console.log(`Region: ${label}`);
console.log(`Bounds: ${south}°N, ${west}°W → ${north}°N, ${east}°W`);
if (dryRun) console.log('DRY RUN — no files will be written\n');

// ─── Distance ────────────────────────────────────────────────────────────────

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Overpass query ──────────────────────────────────────────────────────────

async function overpassQuery(query, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SoakTrail-Data-Enrichment/1.0',
      },
      body: new URLSearchParams({ data: query }),
    });

    if (res.ok) {
      return res.json();
    }

    if (attempt < retries - 1) {
      const wait = (attempt + 1) * 10;
      console.log(`    Overpass ${res.status}, retrying in ${wait}s...`);
      await sleep(wait * 1000);
    } else {
      const text = await res.text();
      throw new Error(`Overpass ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}

// ─── Find hot springs in bounding box ────────────────────────────────────────

async function findHotSprings() {
  const query = `
    [out:json][timeout:120];
    (
      node["natural"="hot_spring"](${south},${west},${north},${east});
      node["bath:type"="hot_spring"](${south},${west},${north},${east});
      way["natural"="hot_spring"](${south},${west},${north},${east});
    );
    out body 200;
  `;

  console.log(`  Querying Overpass for hot springs...`);
  const data = await overpassQuery(query);
  const elements = data.elements || [];

  console.log(`  Found ${elements.length} OSM hot spring elements`);

  return elements
    .filter((e) => e.type === 'node' && e.lat != null)
    .map((e) => ({
      osm_id: e.id,
      lat: e.lat,
      lng: e.lon,
      tags: e.tags || {},
      name: e.tags?.name || 'unnamed',
    }));
}

// ─── Query nearby amenities ──────────────────────────────────────────────────

async function findNearbyAmenities(lat, lng, radius = 2000) {
  const query = `
    [out:json][timeout:60];
    (
      way["highway"](around:${radius},${lat},${lng});
      node["amenity"](around:${radius},${lat},${lng});
      node["tourism"](around:${radius},${lat},${lng});
      way["building"](around:${radius},${lat},${lng});
      node["leisure"](around:${radius},${lat},${lng});
    );
    out body 200;
  `;

  const data = await overpassQuery(query);
  const elements = data.elements || [];

  const amenities = {
    access_roads: [],
    parking: [],
    trails: [],
    buildings: [],
    amenities: [],
  };

  for (const e of elements) {
    const tags = e.tags || {};
    const name = tags.name || null;

    if (tags.highway) {
      const roadTypes = ['residential', 'service', 'unclassified', 'track', 'path', 'footway', 'trail'];
      if (roadTypes.includes(tags.highway)) {
        amenities.access_roads.push({
          type: tags.highway,
          name: name,
          surface: tags.surface || null,
          access: tags.access || null,
        });
      }
      if (['path', 'footway', 'track', 'trail'].includes(tags.highway)) {
        amenities.trails.push({
          type: tags.highway,
          name: name,
          surface: tags.surface || null,
          sac_scale: tags.sac_scale || null,
        });
      }
    }

    if (tags.amenity) {
      amenities.amenities.push({ type: tags.amenity, name });
      if (tags.amenity === 'parking') {
        amenities.parking.push({
          name,
          capacity: tags.capacity || null,
          access: tags.access || null,
          fee: tags.fee || null,
        });
      }
    }

    if (tags.tourism) {
      amenities.amenities.push({ type: `tourism:${tags.tourism}`, name });
    }

    if (tags.building && name) {
      amenities.buildings.push({ type: tags.building, name });
    }

    if (tags.leisure) {
      amenities.amenities.push({ type: `leisure:${tags.leisure}`, name });
    }
  }

  return {
    access_roads: dedupeByType(amenities.access_roads),
    parking: amenities.parking.slice(0, 5),
    trails: dedupeByType(amenities.trails),
    buildings: amenities.buildings.slice(0, 5),
    amenities: dedupeByType(amenities.amenities).slice(0, 10),
  };
}

function dedupeByType(arr) {
  const seen = new Set();
  return arr.filter((item) => {
    const key = `${item.type}:${item.name || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Match OSM to springs ────────────────────────────────────────────────────

function matchOsmToSprings(osmNodes, springs, maxDistanceMiles = 2) {
  const matches = [];
  for (const spring of springs) {
    let bestMatch = null;
    let bestDist = Infinity;
    for (const osm of osmNodes) {
      const dist = haversineMiles(spring.lat, spring.lng, osm.lat, osm.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = osm;
      }
    }
    if (bestMatch && bestDist <= maxDistanceMiles) {
      matches.push({ spring, osm: bestMatch, distance: bestDist });
    }
  }
  return matches;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Loading ${SPRINGS_PATH}...`);
  const springs = JSON.parse(readFileSync(SPRINGS_PATH, 'utf-8'));
  console.log(`Found ${springs.length} springs\n`);

  // Step 1: Find OSM hot springs
  console.log('=== Step 1: Find OSM hot springs ===');
  const osmNodes = await findHotSprings();

  for (const node of osmNodes) {
    console.log(`  ${node.name} (${node.lat}, ${node.lng}) id=${node.osm_id}`);
  }

  // Step 2: Match to springs.json
  console.log('\n=== Step 2: Match OSM to springs ===');
  let matches = matchOsmToSprings(osmNodes, springs, 2);

  if (matches.length === 0) {
    console.log('  No matches within 2mi, trying 10mi...');
    matches = matchOsmToSprings(osmNodes, springs, 10);
  }

  for (const m of matches) {
    console.log(`  ${m.spring.slug} ← ${m.osm.name} (${m.distance.toFixed(2)} mi)`);
  }

  // Step 3: Query nearby amenities
  console.log('\n=== Step 3: Query nearby amenities ===');
  for (const match of matches) {
    const { spring, osm } = match;
    console.log(`\n  ${spring.slug} (${osm.lat}, ${osm.lng})`);

    try {
      const amenities = await findNearbyAmenities(osm.lat, osm.lng, 2000);

      spring.osm = {
        osm_id: osm.osm_id,
        osm_name: osm.name,
        osm_url: `https://www.openstreetmap.org/node/${osm.osm_id}`,
        match_distance_miles: Math.round(match.distance * 100) / 100,
        tags: osm.tags,
        nearby: amenities,
      };

      console.log(`    Roads: ${amenities.access_roads.length}, Parking: ${amenities.parking.length}, Trails: ${amenities.trails.length}, Amenities: ${amenities.amenities.length}`);
    } catch (e) {
      console.warn(`    Failed: ${e.message}`);
    }

    // Save incrementally after each spring
    if (!dryRun) {
      writeFileSync(SPRINGS_PATH, JSON.stringify(springs, null, 2) + '\n', 'utf-8');
    }

    await sleep(5000);
  }

  // Unmatched OSM nodes
  const unmatchedOsm = osmNodes.filter(
    (osm) => !matches.some((m) => m.osm.osm_id === osm.osm_id),
  );
  if (unmatchedOsm.length > 0) {
    console.log(`\n=== Unmatched OSM hot springs (${unmatchedOsm.length}) ===`);
    for (const osm of unmatchedOsm) {
      console.log(`  ${osm.name} (${osm.lat}, ${osm.lng})`);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`OSM matches: ${matches.length}/${springs.length}`);
  console.log(`Unmatched OSM nodes: ${unmatchedOsm.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
