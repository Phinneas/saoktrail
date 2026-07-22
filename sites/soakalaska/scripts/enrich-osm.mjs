#!/usr/bin/env node
/**
 * Enriches springs.json with OSM Overpass data:
 * 1. Queries for natural=hot_spring + bath:type=hot_spring nodes in Alaska
 * 2. For each OSM node, queries nearby amenities (roads, parking, trails, buildings)
 * 3. Matches OSM nodes to springs.json by proximity (within 1 mile)
 * 4. Merges access info, trailheads, and amenities into springs.json
 *
 * Usage: node scripts/enrich-osm.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRINGS_PATH = resolve(__dirname, '../public/springs.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

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

async function overpassQuery(query) {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SoakTrail-Data-Enrichment/1.0',
    },
    body: new URLSearchParams({ data: query }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Overpass ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ─── Step 1: Find all hot spring nodes in Alaska ────────────────────────────

async function findHotSprings() {
  const query = `
    [out:json][timeout:120];
    (
      node["natural"="hot_spring"](55,-170,72,-130);
      node["bath:type"="hot_spring"](55,-170,72,-130);
      way["natural"="hot_spring"](55,-170,72,-130);
    );
    out body 200;
  `;

  console.log('  Querying Overpass for hot springs in Alaska...');
  const data = await overpassQuery(query);
  const elements = data.elements || [];

  console.log(`  Found ${elements.length} OSM hot spring elements`);

  // Extract nodes with coordinates
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

// ─── Step 2: Query nearby amenities for a hot spring ────────────────────────

async function findNearbyAmenities(lat, lng, radius = 2000) {
  // Query for roads, parking, trails, buildings, and amenities within radius
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
      amenities.amenities.push({
        type: tags.amenity,
        name: name,
      });
      if (tags.amenity === 'parking') {
        amenities.parking.push({
          name: name,
          capacity: tags.capacity || null,
          access: tags.access || null,
          fee: tags.fee || null,
        });
      }
    }

    if (tags.tourism) {
      amenities.amenities.push({
        type: `tourism:${tags.tourism}`,
        name: name,
      });
    }

    if (tags.building && name) {
      amenities.buildings.push({
        type: tags.building,
        name: name,
      });
    }

    if (tags.leisure) {
      amenities.amenities.push({
        type: `leisure:${tags.leisure}`,
        name: name,
      });
    }
  }

  // Dedupe and summarize
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

// ─── Step 3: Match OSM nodes to springs.json by proximity ───────────────────

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
  console.log('Loading springs.json...');
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
  const matches = matchOsmToSprings(osmNodes, springs, 2);

  if (matches.length === 0) {
    console.log('  No matches found within 2 miles');
    // Try wider search (10 miles)
    console.log('  Trying wider search (10 miles)...');
    const widerMatches = matchOsmToSprings(osmNodes, springs, 10);
    if (widerMatches.length === 0) {
      console.log('  Still no matches. Adding OSM data to nearest spring anyway.');
    }
    matches.push(...widerMatches);
  }

  for (const m of matches) {
    console.log(`  ${m.spring.slug} ← ${m.osm.name} (${m.distance.toFixed(2)} mi)`);
  }

  // Step 3: For each match, query nearby amenities
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

      console.log(`    Roads: ${amenities.access_roads.length}`);
      console.log(`    Parking: ${amenities.parking.length}`);
      console.log(`    Trails: ${amenities.trails.length}`);
      console.log(`    Amenities: ${amenities.amenities.length}`);
      if (amenities.access_roads.length > 0) {
        amenities.access_roads.forEach((r) => console.log(`      road: ${r.type} ${r.name || ''} (${r.surface || 'unknown surface'})`));
      }
      if (amenities.parking.length > 0) {
        amenities.parking.forEach((p) => console.log(`      parking: ${p.name || 'unnamed'} (cap:${p.capacity || '?'})`));
      }
    } catch (e) {
      console.warn(`    Failed: ${e.message}`);
    }

    await sleep(2000); // Be respectful to Overpass API
  }

  // Also add OSM nodes that didn't match any spring (potential new springs)
  const matchedSlugs = new Set(matches.map((m) => m.spring.slug));
  const unmatchedOsm = osmNodes.filter(
    (osm) => !matches.some((m) => m.osm.osm_id === osm.osm_id),
  );

  if (unmatchedOsm.length > 0) {
    console.log(`\n=== Unmatched OSM hot springs (${unmatchedOsm.length}) ===`);
    for (const osm of unmatchedOsm) {
      console.log(`  ${osm.name} (${osm.lat}, ${osm.lng}) — not in springs.json`);
    }
  }

  // Write enriched data
  writeFileSync(SPRINGS_PATH, JSON.stringify(springs, null, 2) + '\n', 'utf-8');
  console.log(`\n=== Done ===`);
  console.log(`OSM matches: ${matches.length}/${springs.length}`);
  console.log(`Unmatched OSM nodes: ${unmatchedOsm.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
