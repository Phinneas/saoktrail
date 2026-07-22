#!/usr/bin/env node
/**
 * Export springs data from master D1 API to per-site springs.json files.
 * Run at build time before Astro builds.
 *
 * Usage:
 *   node scripts/export-springs.mjs --site=soakalaska
 *   node scripts/export-springs.mjs --all
 *
 * Env vars:
 *   MASTER_API_URL - URL of the master API Worker (e.g. https://soaktherockies-api.xxx.workers.dev)
 *                    If not set, script silently skips (uses existing springs.json)
 */

import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SITES = ['wa_hot', 'soakcolorados', 'desert', 'mountshasthotsprings', 'soaktherockies', 'soakalaska'];

const apiUrl = process.env.MASTER_API_URL;

// Parse args
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [key, val] = a.replace(/^--/, '').split('=');
    return [key, val ?? true];
  })
);

const site = args.site;
const doAll = args.all;

if (!apiUrl) {
  console.log('MASTER_API_URL not set — skipping export (using existing springs.json)');
  process.exit(0);
}

if (!site && !doAll) {
  console.error('Usage: node scripts/export-springs.mjs --site=soakalaska OR --all');
  process.exit(1);
}

const sitesToExport = doAll ? SITES : [site];

async function exportSite(siteName) {
  console.log(`Exporting ${siteName}...`);
  try {
    const res = await fetch(`${apiUrl}/api/springs/export/${siteName}`);
    if (!res.ok) {
      console.warn(`  API returned ${res.status} — keeping existing springs.json`);
      return;
    }
    const data = await res.json();
    const springs = data.data || data;
    const outPath = resolve(ROOT, `sites/${siteName}/public/springs.json`);
    writeFileSync(outPath, JSON.stringify(springs, null, 2) + '\n', 'utf-8');
    console.log(`  ${springs.length} springs → ${outPath}`);
  } catch (e) {
    console.warn(`  Failed: ${e.message} — keeping existing springs.json`);
  }
}

async function main() {
  for (const s of sitesToExport) {
    await exportSite(s);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
