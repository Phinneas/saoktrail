#!/usr/bin/env node
/**
 * Emits per-region SQL to load spring_images into each regional D1 database.
 * Reads data/spring_images_by_region.json (produced by export_spring_images.py)
 * and writes scripts/images-import-<region>.sql files.
 *
 * Apply each file to its regional D1, e.g.:
 *   npx wrangler d1 execute soaktherockies-springs-db --file=scripts/images-import-rockies.sql --remote
 *
 * Usage: node scripts/import-images-to-d1.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// region -> D1 database name (matches wrangler.toml d1_databases)
const REGION_DB = {
  desert: 'desertsoak-db',
  rockies: 'soaktherockies-springs-db',
  colorado: 'soakcolorado-springs-db',
  shasta: 'shastahotsprings-db',
  washington: 'washingtonhotsprings-db',
  alaska: 'alaskahotsprings-db',
};

const COLUMNS = [
  'spring_slug', 'source', 'image_url', 'thumb_url', 'license_code',
  'license_url', 'attribution', 'source_url', 'provider_image_id',
  'width', 'height', 'is_primary', 'rank', 'captured_at',
];

function escapeSql(val) {
  if (val == null || val === '') return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function main() {
  const jsonPath = resolve(ROOT, 'data/spring_images_by_region.json');
  let byRegion;
  try {
    byRegion = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.error(`Cannot read ${jsonPath}. Run: uv run scripts/export_spring_images.py first.`);
    process.exit(1);
  }

  let total = 0;
  const commands = [];

  for (const [region, rows] of Object.entries(byRegion)) {
    const db = REGION_DB[region];
    if (!db) {
      console.warn(`  Skipping unknown region: ${region}`);
      continue;
    }
    const lines = [
      `-- Auto-generated spring_images import for region: ${region}`,
      `-- DB: ${db}`,
      `-- Apply with: npx wrangler d1 execute ${db} --file=scripts/images-import-${region}.sql --remote`,
      '',
    ];
    for (const row of rows) {
      const values = COLUMNS.map((col) => escapeSql(row[col]));
      lines.push(
        `INSERT OR REPLACE INTO spring_images (${COLUMNS.join(', ')}, last_fetched) ` +
          `VALUES (${values.join(', ')}, datetime('now'));`
      );
      total++;
    }
    const outPath = resolve(ROOT, 'scripts', `images-import-${region}.sql`);
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');
    console.log(`  ${region}: ${rows.length} rows -> ${outPath}`);
    commands.push(`npx wrangler d1 execute ${db} --file=scripts/images-import-${region}.sql --remote`);
  }

  console.log(`\nTotal: ${total} image rows across ${Object.keys(byRegion).length} regions`);
  console.log('\nApply with:');
  for (const c of commands) console.log(`  ${c}`);
}

main();
