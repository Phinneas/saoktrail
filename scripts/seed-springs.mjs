#!/usr/bin/env node
/**
 * seed-springs.mjs — Pulls hot springs data from Exa API and generates
 * SQL INSERT files for Cloudflare D1 seeding.
 *
 * Usage:
 *   EXA_API_KEY=your-key-here node scripts/seed-springs.mjs
 *
 * Outputs:
 *   migrations/seed_alaska.sql     → for alaskahotsprings-db
 *   migrations/seed_new_mexico.sql → for soakcolorado-springs-db
 *
 * Then execute with wrangler:
 *   wrangler d1 execute alaskahotsprings-db --remote --file migrations/seed_alaska.sql --experimental-provision=false
 *   wrangler d1 execute soakcolorado-springs-db --remote --file migrations/seed_new_mexico.sql --experimental-provision=false
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const EXA_API_KEY = process.env.EXA_API_KEY;
if (!EXA_API_KEY) {
  console.error('ERROR: Set EXA_API_KEY environment variable first.');
  console.error('  EXA_API_KEY=your-key node scripts/seed-springs.mjs');
  process.exit(1);
}

const EXA_ENDPOINT = 'https://api.exa.ai/search';

// Output schema: Exa synthesizes results into structured hot springs data
const outputSchema = {
  type: 'object',
  properties: {
    springs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the hot spring' },
          latitude: { type: 'number', description: 'Decimal latitude' },
          longitude: { type: 'number', description: 'Decimal longitude' },
          description: { type: 'string', description: 'Brief description' },
          access_type: {
            type: 'string',
            enum: ['paved', 'dirt', 'hike', '4wd', 'resort', 'boat', 'drive-up'],
          },
          development: {
            type: 'string',
            enum: ['primitive', 'developed', 'resort'],
          },
          temperature_f: { type: 'integer', description: 'Soaking temp Fahrenheit' },
        },
        required: ['name', 'latitude', 'longitude'],
      },
    },
  },
  required: ['springs'],
};

const QUERIES = [
  {
    label: 'Alaska',
    query: 'Complete list of hot springs in Alaska with precise latitude and longitude coordinates, including natural wilderness pools, resort springs, and remote backcountry springs',
    state: 'ak',
    region: 'alaska',
    outputFile: 'migrations/seed_alaska.sql',
    systemPrompt: 'Focus on all known hot springs in Alaska — include resorts like Chena Hot Springs, natural springs like Manley Hot Springs, Pilgrim Hot Springs, and any remote/backcountry springs. Provide precise decimal coordinates. Exclude cold springs. Include as many as possible.',
  },
  {
    label: 'New Mexico',
    query: 'Complete list of hot springs in New Mexico with precise latitude and longitude coordinates, including natural wilderness pools, resort springs, and backcountry springs',
    state: 'nm',
    region: 'colorado',
    outputFile: 'migrations/seed_new_mexico.sql',
    systemPrompt: 'Focus on all known hot springs in New Mexico — include resorts like Truth or Consequences hot springs, natural springs like Gila Hot Springs, San Antonio Hot Springs, Spence Hot Springs, and any remote/backcountry springs. Provide precise decimal coordinates. Exclude cold springs. Include as many as possible.',
  },
];

function slugify(name, state) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '-' + state;
}

function sqlEscape(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

async function fetchSprings(queryConfig) {
  console.log(`\nSearching Exa for: ${queryConfig.label}...`);
  console.log(`  Query: "${queryConfig.query.substring(0, 80)}..."`);

  const body = {
    query: queryConfig.query,
    numResults: 50,
    type: 'deep',
    outputSchema,
    systemPrompt: queryConfig.systemPrompt,
    contents: { text: true },
  };

  const res = await fetch(EXA_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': EXA_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const outputContent = data.output?.content;

  if (!outputContent) {
    console.error('  No output.content in response');
    console.error('  Response keys:', Object.keys(data));
    return [];
  }

  // outputContent is a JSON string matching the outputSchema
  let parsed;
  try {
    parsed = typeof outputContent === 'string' ? JSON.parse(outputContent) : outputContent;
  } catch {
    console.error('  Failed to parse output.content as JSON');
    console.error('  Raw:', String(outputContent).substring(0, 500));
    return [];
  }

  const springs = parsed.springs || [];
  console.log(`  Found ${springs.length} springs from Exa`);
  return springs;
}

function generateSQL(springs, queryConfig) {
  const seenSlugs = new Set();
  const inserts = [];

  for (const s of springs) {
    if (!s.name || s.latitude == null || s.longitude == null) {
      console.log(`  SKIP: missing required fields for "${s.name || 'unknown'}"`);
      continue;
    }

    let slug = slugify(s.name, queryConfig.state);
    // Deduplicate slugs
    if (seenSlugs.has(slug)) {
      slug = slug + '-2';
      let i = 2;
      while (seenSlugs.has(slug)) {
        i++;
        slug = slugify(s.name, queryConfig.state) + '-' + i;
      }
    }
    seenSlugs.add(slug);

    const cols = [
      'name', 'slug', 'lat', 'lon', 'state', 'region', 'access_type', 'development',
    ];
    const vals = [
      sqlEscape(s.name),
      sqlEscape(slug),
      s.latitude,
      s.longitude,
      sqlEscape(queryConfig.state),
      sqlEscape(queryConfig.region),
      sqlEscape(s.access_type || 'hike'),
      sqlEscape(s.development || 'primitive'),
    ];

    // Optional fields
    if (s.description) { cols.push('description'); vals.push(sqlEscape(s.description)); }
    if (s.temperature_f != null) { cols.push('temperature_f'); vals.push(s.temperature_f); }
    if (s.nearby_town) { cols.push('nearby_town'); vals.push(sqlEscape(s.nearby_town)); }
    if (s.elevation_ft != null) { cols.push('elevation_ft'); vals.push(s.elevation_ft); }
    if (s.fees) { cols.push('fees'); vals.push(sqlEscape(s.fees)); }
    if (s.dog_policy && s.dog_policy !== 'unknown') { cols.push('dog_policy'); vals.push(sqlEscape(s.dog_policy)); }
    if (s.clothing_policy && s.clothing_policy !== 'unknown') { cols.push('clothing_policy'); vals.push(sqlEscape(s.clothing_policy)); }
    if (s.seasonal_open) { cols.push('seasonal_open'); vals.push(sqlEscape(s.seasonal_open)); }
    if (s.seasonal_close) { cols.push('seasonal_close'); vals.push(sqlEscape(s.seasonal_close)); }

    inserts.push(
      `INSERT INTO springs (${cols.join(', ')}) VALUES (${vals.join(', ')});`
    );
  }

  const header = `-- Seed data for ${queryConfig.label} hot springs\n-- Generated from Exa API search on ${new Date().toISOString()}\n-- Target: ${queryConfig.region} D1 database\n\n`;

  return header + inserts.join('\n') + '\n';
}

async function main() {
  for (const q of QUERIES) {
    try {
      const springs = await fetchSprings(q);
      if (springs.length === 0) {
        console.log(`  No springs found for ${q.label}, skipping SQL generation`);
        continue;
      }

      const sql = generateSQL(springs, q);
      const outPath = join(ROOT, q.outputFile);
      writeFileSync(outPath, sql);
      console.log(`  Wrote ${springs.length} INSERT statements to ${q.outputFile}`);
      console.log(`  Execute with: wrangler d1 execute ${q.region === 'alaska' ? 'alaskahotsprings-db' : 'soakcolorado-springs-db'} --remote --file ${q.outputFile} --experimental-provision=false`);
    } catch (err) {
      console.error(`  ERROR for ${q.label}: ${err.message}`);
    }
  }
  console.log('\nDone.');
}

main();
