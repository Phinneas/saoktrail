#!/usr/bin/env node
/**
 * Enriches springs.json with:
 * 1. Elevation (Open-Meteo elevation API — free, no key)
 * 2. Wikipedia article URL + summary (Wikipedia GeoSearch + REST API — free, no key)
 * 3. Nearby campgrounds (Recreation.gov internal search API — no key needed)
 *
 * Usage: node scripts/enrich-springs.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRINGS_PATH = resolve(__dirname, '../public/springs.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Elevation ───────────────────────────────────────────────────────────────

async function fetchElevations(springs) {
  // Open-Meteo supports batch queries (up to 100 coords)
  const lats = springs.map((s) => s.lat).join(',');
  const lons = springs.map((s) => s.lng).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

  console.log(`  Fetching elevations for ${springs.length} springs...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Elevation API failed: ${res.status}`);
  const data = await res.json();

  return data.elevation; // array of elevations in meters
}

function metersToFeet(m) {
  return Math.round(m * 3.28084);
}

// ─── Wikipedia ───────────────────────────────────────────────────────────────

async function fetchWikipedia(lat, lng) {
  // GeoSearch for articles within 10km
  const geoUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=10000&gslimit=5&format=json&origin=*`;

  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) return null;
  const geoData = await geoRes.json();
  const pages = geoData?.query?.geosearch;
  if (!pages || pages.length === 0) return null;

  // Find the closest article with "hot spring" in the title, or just the closest
  const springPage = pages.find((p) => p.title.toLowerCase().includes('hot spring'));
  const page = springPage || pages[0];

  // Fetch summary from REST API
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title)}`;
  const sumRes = await fetch(summaryUrl);
  if (!sumRes.ok) {
    return {
      wikipedia_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      wikipedia_summary: null,
    };
  }
  const sumData = await sumRes.json();

  return {
    wikipedia_url: sumData?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    wikipedia_summary: sumData?.extract || null,
  };
}

// ─── Recreation.gov Campgrounds ──────────────────────────────────────────────

async function fetchCampgrounds(lat, lng) {
  const url = `https://www.recreation.gov/api/search?latitude=${lat}&longitude=${lng}&radius=20&inventory_type=camping&start=0&size=5`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    console.warn(`    Campground search failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  const results = data?.results || [];

  return results.slice(0, 5).map((r) => {
    const e = r?.entity || {};
    return {
      name: e.name || 'Unknown',
      url: `https://www.recreation.gov/camping/campsites/${r?.entity_id || ''}`,
      distance_miles: r?.distance ? Math.round(r.distance * 0.621371 * 10) / 10 : null,
      num_sites: e?.num_campsites || null,
      type: e?.asset_type || 'campground',
    };
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading springs.json...');
  const springs = JSON.parse(readFileSync(SPRINGS_PATH, 'utf-8'));
  console.log(`Found ${springs.length} springs\n`);

  // 1. Batch fetch all elevations
  console.log('=== Elevation ===');
  const elevationsM = await fetchElevations(springs);
  springs.forEach((s, i) => {
    if (elevationsM[i] != null) {
      s.elevation_ft = metersToFeet(elevationsM[i]);
      console.log(`  ${s.slug}: ${s.elevation_ft} ft`);
    }
  });

  // 2. Fetch Wikipedia + campgrounds for each spring (sequential with delay)
  for (const spring of springs) {
    console.log(`\n=== ${spring.slug} ===`);

    // Wikipedia
    try {
      console.log('  Fetching Wikipedia...');
      const wiki = await fetchWikipedia(spring.lat, spring.lng);
      if (wiki) {
        spring.wikipedia_url = wiki.wikipedia_url;
        spring.wikipedia_summary = wiki.wikipedia_summary;
        console.log(`  Wikipedia: ${wiki.wikipedia_url}`);
      } else {
        console.log('  Wikipedia: no article found');
      }
    } catch (e) {
      console.warn(`  Wikipedia failed: ${e.message}`);
    }
    await sleep(500);

    // Campgrounds
    try {
      console.log('  Fetching campgrounds...');
      const campgrounds = await fetchCampgrounds(spring.lat, spring.lng);
      if (campgrounds.length > 0) {
        spring.campgrounds = campgrounds;
        console.log(`  Campgrounds: ${campgrounds.length} found`);
        campgrounds.forEach((c) => console.log(`    - ${c.name} (${c.distance_miles} mi)`));
      } else {
        console.log('  Campgrounds: none found');
      }
    } catch (e) {
      console.warn(`  Campgrounds failed: ${e.message}`);
    }
    await sleep(1000);
  }

  // Write enriched data
  writeFileSync(SPRINGS_PATH, JSON.stringify(springs, null, 2) + '\n', 'utf-8');
  console.log(`\n=== Done ===`);
  console.log(`Written to ${SPRINGS_PATH}`);

  // Summary
  const hasElev = springs.filter((s) => s.elevation_ft).length;
  const hasWiki = springs.filter((s) => s.wikipedia_url).length;
  const hasCamp = springs.filter((s) => s.campgrounds?.length).length;
  console.log(`Elevation: ${hasElev}/${springs.length}`);
  console.log(`Wikipedia: ${hasWiki}/${springs.length}`);
  console.log(`Campgrounds: ${hasCamp}/${springs.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
