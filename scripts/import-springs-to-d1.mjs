#!/usr/bin/env node
/**
 * Imports all sites' springs.json data into the master D1 database.
 * Generates a SQL file that can be applied via:
 *   wrangler d1 execute soaktherockies-springs-db --file=springs-import.sql --remote
 *
 * Usage: node scripts/import-springs-to-d1.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SITES = ['wa_hot', 'soakcolorados', 'desert', 'mountshasthotsprings', 'soaktherockies', 'soakalaska'];

function escapeSql(val) {
  if (val == null) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function normalizeSpring(spring, site) {
  // Normalize field names across sites
  const lat = spring.lat ?? spring.lat;
  const lng = spring.lng ?? spring.lon ?? spring.lng;

  return {
    id: spring.id,
    slug: spring.slug,
    name: spring.name,
    lat: lat,
    lng: lng,
    state: spring.state,
    site: site,

    temp_f: spring.temp_f ?? spring.temperature_f,
    temperature_f: spring.temperature_f ?? spring.temp_f,
    fee: spring.fee,
    fee_amount_usd: spring.fee_amount_usd,
    fees: spring.fees,
    access_type: spring.access_type,
    development: spring.development,
    season: spring.season,
    hours: spring.hours,
    clothing: spring.clothing ?? spring.clothing_policy,
    clothing_policy: spring.clothing_policy,
    parking: spring.parking,
    description: spring.description,
    best_time: spring.best_time,
    insider_tips: spring.insider_tips,
    has_post: spring.has_post,

    region: spring.region,
    nearby_town: spring.nearby_town,
    distance_to_town_mi: spring.distance_to_town_mi,
    elevation_ft: spring.elevation_ft,
    fs_road: spring.fs_road,
    road_condition: spring.road_condition,
    trailhead_lat: spring.trailhead_lat,
    trailhead_lon: spring.trailhead_lon,

    reservation_required: spring.reservation_required,
    reservation_url: spring.reservation_url,
    seasonal_open: spring.seasonal_open,
    seasonal_close: spring.seasonal_close,
    seasonal_notes: spring.seasonal_notes,

    cell_coverage: spring.cell_coverage ?? spring.cell_service,
    cell_service: spring.cell_service,
    ada_accessible: spring.ada_accessible,
    dog_policy: spring.dog_policy,
    pool_count: spring.pool_count,
    water_flow: spring.water_flow,
    image_url: spring.image_url,

    chemistry: spring.chemistry ? JSON.stringify(spring.chemistry) : null,
    chemistry_details: spring.chemistry_details ? JSON.stringify(spring.chemistry_details) : null,
    chemistry_level: spring.chemistry_level,
    chemistry_sampled_on: spring.chemistry_sampled_on,
    chemistry_source: spring.chemistry_source,
    source_temperature_c: spring.source_temperature_c,

    wikipedia_url: spring.wikipedia_url,
    wikipedia_summary: spring.wikipedia_summary,
    usgs_json: spring.usgs ? JSON.stringify(spring.usgs) : null,
    osm_json: spring.osm ? JSON.stringify(spring.osm) : null,
  };
}

const COLUMNS = [
  'id', 'slug', 'name', 'lat', 'lng', 'state', 'site',
  'temp_f', 'temperature_f', 'fee', 'fee_amount_usd', 'fees',
  'access_type', 'development', 'season', 'hours', 'clothing', 'clothing_policy',
  'parking', 'description', 'best_time', 'insider_tips', 'has_post',
  'region', 'nearby_town', 'distance_to_town_mi', 'elevation_ft', 'fs_road',
  'road_condition', 'trailhead_lat', 'trailhead_lon',
  'reservation_required', 'reservation_url', 'seasonal_open', 'seasonal_close', 'seasonal_notes',
  'cell_coverage', 'cell_service', 'ada_accessible', 'dog_policy', 'pool_count',
  'water_flow', 'image_url',
  'chemistry', 'chemistry_details', 'chemistry_level', 'chemistry_sampled_on',
  'chemistry_source', 'source_temperature_c',
  'wikipedia_url', 'wikipedia_summary', 'usgs_json', 'osm_json',
];

async function main() {
  let totalSprings = 0;
  const sqlLines = [];

  sqlLines.push('-- Auto-generated springs import');
  sqlLines.push('-- Run with: wrangler d1 execute soaktherockies-springs-db --file=scripts/springs-import.sql --remote');
  sqlLines.push('');

  for (const site of SITES) {
    const path = resolve(ROOT, `sites/${site}/public/springs.json`);
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      console.log(`${site}: ${data.length} springs`);

      for (const spring of data) {
        const normalized = normalizeSpring(spring, site);
        const values = COLUMNS.map((col) => escapeSql(normalized[col]));
        sqlLines.push(
          `INSERT OR REPLACE INTO springs (${COLUMNS.join(', ')}) VALUES (${values.join(', ')});`
        );
        totalSprings++;
      }
    } catch (e) {
      console.warn(`  Skipping ${site}: ${e.message}`);
    }
  }

  const sqlPath = resolve(ROOT, 'scripts/springs-import.sql');
  writeFileSync(sqlPath, sqlLines.join('\n') + '\n', 'utf-8');

  console.log(`\nTotal: ${totalSprings} springs`);
  console.log(`SQL written to: ${sqlPath}`);
  console.log(`\nApply with:`);
  console.log(`  cd services/api && npx wrangler d1 execute soaktherockies-springs-db --file=../scripts/springs-import.sql --remote`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
